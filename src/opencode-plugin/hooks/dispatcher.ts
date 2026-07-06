/**
 * OC plugin hook dispatcher (spec D-04, D-05, D-06, D-07, D-10, D-11).
 *
 * Spawns compiled .cjs hook scripts as child processes and applies an
 * event-dependent error policy:
 *   - tool.execute.before: exitCode 2 → throw (OC aborts tool call)
 *   - tool.execute.after:  never throws; failures logged to oc-hook-failures.jsonl
 *
 * Each .cjs invocation gets:
 *   - stdin: JSON payload (BeforePayload or AfterPayload)
 *   - stdout: JSON HookResult
 *   - 5 second wall-clock timeout
 */

import { spawn } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { HookKind, HookResult } from '../../core/types.js'
import { pluginCleanup } from '../cleanup-registry.js'
import { resolveHookFiles } from './discovery.js'
import { OC_HOOK_MAP } from './map.js'
import {
  type OcAfterInput,
  type OcAfterOutput,
  type OcBeforeInput,
  type OcBeforeOutput,
  buildAfterPayload,
  buildBeforePayload,
  buildSafeEnv,
} from './payload.js'

// ─── Constants ──────────────────────────────────────────────────────────────

/** Per-hook invocation timeout in milliseconds (D-05). */
export const OC_HOOK_TIMEOUT_MS = 5_000

/** Log file for hook timing entries (D-10). */
const TIMINGS_LOG = join(homedir(), '.anvil', 'logs', 'oc-hook-timings.jsonl')

/** Log file for after-hook failures (D-10). */
const FAILURES_LOG = join(homedir(), '.anvil', 'logs', 'oc-hook-failures.jsonl')

const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// ─── Manifest disabled-hooks cache ───────────────────────────────────────────

let disabledHooksCache: Set<string> | null = null
let disabledHooksCacheAnvilRoot: string | null = null

async function getDisabledHooks(anvilRoot: string): Promise<Set<string>> {
  if (
    disabledHooksCache !== null &&
    disabledHooksCacheAnvilRoot === anvilRoot
  ) {
    return disabledHooksCache
  }
  try {
    const raw = await readFile(join(anvilRoot, 'manifest.json'), 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'disabled' in parsed &&
      typeof (parsed as { disabled: unknown }).disabled === 'object' &&
      (parsed as { disabled: unknown }).disabled !== null
    ) {
      const disabled = (parsed as { disabled: { hooks?: unknown } }).disabled
      if (Array.isArray(disabled.hooks)) {
        const validated = HookKind.array().safeParse(disabled.hooks)
        const set = new Set<string>(validated.success ? validated.data : [])
        disabledHooksCache = set
        disabledHooksCacheAnvilRoot = anvilRoot
        return set
      }
    }
  } catch {
    // missing or corrupt manifest — proceed with empty set
  }
  disabledHooksCache = new Set()
  disabledHooksCacheAnvilRoot = anvilRoot
  return disabledHooksCache
}

/** Clears the disabled-hooks cache. Exposed for tests. */
export function clearManifestCache(): void {
  disabledHooksCache = null
  disabledHooksCacheAnvilRoot = null
}

// ANV-0097: register the manifest cache reset against the plugin-wide cleanup
// registry so plugin shutdown / reload tears it down with the rest of the
// runtime state. Process-scoped state created at module load → must drain.
pluginCleanup.register(() => {
  clearManifestCache()
})

// ─── Logging ─────────────────────────────────────────────────────────────────

interface TimingEntry {
  timestamp: string
  hook_path: string
  kind: string
  duration_ms: number
  exit_code: number
  surface: 'opencode'
}

interface FailureEntry {
  timestamp: string
  hook_path: string
  kind: string
  exit_code: number
  stderr: string
  surface: 'opencode'
}

function ensureLogDir(): void {
  try {
    mkdirSync(join(homedir(), '.anvil', 'logs'), { recursive: true })
  } catch {
    // best-effort
  }
}

function appendTiming(entry: TimingEntry): void {
  try {
    ensureLogDir()
    appendFileSync(TIMINGS_LOG, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // best-effort; never abort on log errors
  }
}

function appendFailure(entry: FailureEntry): void {
  try {
    ensureLogDir()
    appendFileSync(FAILURES_LOG, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // best-effort
  }
}

/**
 * Rotate the JSONL log file by dropping lines older than LOG_MAX_AGE_MS.
 * Uses a single stat check; actual rotation only if mtime > 7 days old.
 * Never throws.
 */
function maybeRotateLog(path: string): void {
  try {
    let fileMtimeMs: number
    try {
      const stat = statSync(path)
      fileMtimeMs = stat.mtimeMs
    } catch {
      return // file absent — nothing to rotate
    }
    if (Date.now() - fileMtimeMs < LOG_MAX_AGE_MS) return
    const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean)
    const cutoff = Date.now() - LOG_MAX_AGE_MS
    const kept = lines.filter((line) => {
      try {
        const entry = JSON.parse(line) as { timestamp?: string }
        return new Date(entry.timestamp ?? '').getTime() >= cutoff
      } catch {
        return false
      }
    })
    writeFileSync(path, kept.join('\n') + (kept.length ? '\n' : ''), 'utf-8')
  } catch {
    // best-effort
  }
}

// ─── Error type ──────────────────────────────────────────────────────────────

/**
 * Thrown by dispatchOcBefore when a hook returns exitCode 2.
 * OC's tool.execute.before abort mechanism: throwing from the handler
 * aborts the tool call (D-04, confirmed B1.1).
 */
export class OcHookBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OcHookBlockedError'
  }
}

// ─── Child-process invocation ────────────────────────────────────────────────

interface InvokeResult {
  exitCode: number
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
}

async function invokeHook(
  hookPath: string,
  payloadJson: string,
): Promise<InvokeResult> {
  return new Promise((resolve) => {
    const start = performance.now()
    let stdout = ''
    let stderr = ''
    let settled = false

    // Threat model: repo-local hooks must not receive parent-process secrets.
    // buildSafeEnv() forwards only the allowlisted subset (see payload.ts).
    const child = spawn(process.execPath, [hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: buildSafeEnv(),
    })

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
      resolve({
        exitCode: 0,
        stdout: '',
        stderr: `[anvil:oc-dispatcher] hook timed out after ${OC_HOOK_TIMEOUT_MS}ms: ${hookPath}`,
        timedOut: true,
        durationMs: performance.now() - start,
      })
    }, OC_HOOK_TIMEOUT_MS)

    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode: 0,
        stdout: '',
        stderr: `[anvil:oc-dispatcher] spawn error for ${hookPath}: ${String(err)}`,
        timedOut: false,
        durationMs: performance.now() - start,
      })
    })

    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        exitCode: code ?? 0,
        stdout,
        stderr,
        timedOut: false,
        durationMs: performance.now() - start,
      })
    })

    try {
      child.stdin.write(payloadJson, 'utf-8')
      child.stdin.end()
    } catch {
      // stdin write failed — process already exited; result comes via close
    }
  })
}

// ─── Result parsing ──────────────────────────────────────────────────────────

function parseHookResult(stdout: string): {
  exitCode: 0 | 1 | 2
  message?: string
  systemInsert?: string
} {
  if (!stdout.trim()) {
    return { exitCode: 0 }
  }
  try {
    const raw: unknown = JSON.parse(stdout)
    const parsed = HookResult.safeParse(raw)
    if (parsed.success) return parsed.data
    // malformed but parseable JSON — treat as pass
    process.stderr.write(
      '[anvil:oc-dispatcher] hook stdout failed HookResult validation; treating as exitCode 0\n',
    )
    return { exitCode: 0 }
  } catch {
    // non-JSON stdout — treat as pass (silent-failure discipline)
    process.stderr.write(
      '[anvil:oc-dispatcher] hook stdout is not valid JSON; treating as exitCode 0\n',
    )
    return { exitCode: 0 }
  }
}

// ─── argsPatch deep merge ────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function deepMerge(
  target: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target }
  for (const key of Object.keys(patch)) {
    const tv = result[key]
    const pv = patch[key]
    if (isPlainObject(tv) && isPlainObject(pv)) {
      result[key] = deepMerge(tv, pv)
    } else {
      result[key] = pv
    }
  }
  return result
}

function applyArgsPatch(
  args: Record<string, unknown>,
  systemInsert: string | undefined,
): Record<string, unknown> {
  if (!systemInsert) return args
  try {
    const parsed: unknown = JSON.parse(systemInsert)
    if (
      isPlainObject(parsed) &&
      'argsPatch' in parsed &&
      isPlainObject(parsed.argsPatch)
    ) {
      return deepMerge(args, parsed.argsPatch)
    }
  } catch {
    // non-JSON systemInsert is a text banner — ignored at args layer (D-06)
  }
  return args
}

// ─── contextMutation rewrite ─────────────────────────────────────────────────

function applyContextMutation(
  output: OcAfterOutput,
  systemInsert: string | undefined,
): void {
  if (!systemInsert) return
  try {
    const parsed: unknown = JSON.parse(systemInsert)
    if (
      isPlainObject(parsed) &&
      'stashedAt' in parsed &&
      typeof parsed.stashedAt === 'string' &&
      'summary' in parsed &&
      typeof parsed.summary === 'string'
    ) {
      output.output = `${parsed.summary}\n\nsee notepad: ${parsed.stashedAt}`
    }
  } catch {
    // non-JSON systemInsert — ignore at contextMutation layer
  }
}

// ─── Dispatcher — before ─────────────────────────────────────────────────────

export interface OcBeforeDispatchArgs {
  input: OcBeforeInput
  output: OcBeforeOutput
  cwd: string
  anvilRoot: string
}

/**
 * Dispatch tool.execute.before hooks for all matching HookKinds.
 *
 * Error policy (D-04):
 *   - exitCode 2 → throw OcHookBlockedError (OC aborts tool call)
 *   - exitCode 1 → write to stderr, allow call through
 *   - exitCode 0 → silent
 *
 * Applies argsPatch (D-06) from any hook that returns a JSON systemInsert
 * containing {"argsPatch": {...}}.
 */
export async function dispatchOcBefore(
  args: OcBeforeDispatchArgs,
): Promise<void> {
  maybeRotateLog(TIMINGS_LOG)

  const { input, output, cwd, anvilRoot } = args
  const disabled = await getDisabledHooks(anvilRoot)

  let worstExitCode: 0 | 1 | 2 = 0
  let blockMessage = ''
  const beforeKinds = Array.from(OC_HOOK_MAP.entries())
    .filter(([, event]) => event === 'tool.execute.before')
    .map(([kind]) => kind)

  for (const kind of beforeKinds) {
    if (disabled.has(kind)) continue

    // Sort for deterministic argsPatch merge order (D-08).
    const files = (await resolveHookFiles(kind, cwd)).slice().sort()
    if (files.length === 0) continue

    // Build payloads before spawning (captures current output.args snapshot).
    const payloads: Array<{ hookPath: string; payload: string }> = []
    for (const hookPath of files) {
      try {
        const payloadObj = buildBeforePayload(kind, input, output, cwd)
        payloads.push({ hookPath, payload: JSON.stringify(payloadObj) })
      } catch {
        // Payload build failure (e.g. invalid tool name) — skip hook
        process.stderr.write(
          `[anvil:oc-dispatcher] skipping hook ${hookPath}: payload build failed\n`,
        )
      }
    }

    // Run all hooks within this kind in parallel (D-08).
    const results = await Promise.all(
      payloads.map(({ hookPath, payload }) => invokeHook(hookPath, payload)),
    )

    // Process results in sorted order so argsPatch merges are deterministic.
    for (let i = 0; i < payloads.length; i++) {
      const { hookPath } = payloads[i]
      const result = results[i]

      // Log timing
      appendTiming({
        timestamp: new Date().toISOString(),
        hook_path: hookPath,
        kind,
        duration_ms: result.durationMs,
        exit_code: result.exitCode,
        surface: 'opencode',
      })

      if (result.stderr) {
        process.stderr.write(result.stderr)
        if (!result.stderr.endsWith('\n')) process.stderr.write('\n')
      }

      if (result.timedOut) {
        // D-05: fail-open on hung hooks (do not block)
        process.stderr.write(
          `[anvil:oc-dispatcher] before hook timed out — proceeding (fail-open): ${hookPath}\n`,
        )
        continue
      }

      const parsed = parseHookResult(result.stdout)

      // Apply argsPatch (D-06) — applied in sorted order for reproducibility
      output.args = applyArgsPatch(output.args, parsed.systemInsert)

      if (parsed.exitCode === 2) {
        worstExitCode = 2
        blockMessage = parsed.message ?? `Hook blocked tool call: ${hookPath}`
      } else if (parsed.exitCode === 1 && worstExitCode < 2) {
        worstExitCode = 1
        const warnMsg = parsed.message ?? `Hook warned: ${hookPath}`
        process.stderr.write(`[anvil:oc-hook] warn: ${warnMsg}\n`)
      }
    }
  }

  if (worstExitCode === 2) {
    throw new OcHookBlockedError(blockMessage)
  }
}

// ─── Dispatcher — after ──────────────────────────────────────────────────────

export interface OcAfterDispatchArgs {
  input: OcAfterInput
  output: OcAfterOutput
  cwd: string
  anvilRoot: string
  durationMs?: number
}

/**
 * Dispatch tool.execute.after hooks for all matching HookKinds.
 *
 * Error policy (D-04): never throws. Any non-zero exit code is logged to
 * oc-hook-failures.jsonl. contextMutation (D-07) rewrites output.output.
 */
export async function dispatchOcAfter(
  args: OcAfterDispatchArgs,
): Promise<void> {
  maybeRotateLog(FAILURES_LOG)

  const { input, output, cwd, anvilRoot, durationMs = 0 } = args
  const disabled = await getDisabledHooks(anvilRoot)

  const afterKinds = Array.from(OC_HOOK_MAP.entries())
    .filter(([, event]) => event === 'tool.execute.after')
    .map(([kind]) => kind)

  for (const kind of afterKinds) {
    if (disabled.has(kind)) continue

    const files = await resolveHookFiles(kind, cwd)
    if (files.length === 0) continue

    // Build payloads before spawning.
    const payloads: Array<{ hookPath: string; payload: string }> = []
    for (const hookPath of files) {
      try {
        const payloadObj = buildAfterPayload(
          kind,
          input,
          output,
          cwd,
          durationMs,
          (output as unknown as { args?: unknown }).args ?? {},
        )
        payloads.push({ hookPath, payload: JSON.stringify(payloadObj) })
      } catch {
        process.stderr.write(
          `[anvil:oc-dispatcher] skipping after hook ${hookPath}: payload build failed\n`,
        )
      }
    }

    // Run all hooks within this kind in parallel (D-08).
    const results = await Promise.all(
      payloads.map(({ hookPath, payload }) => invokeHook(hookPath, payload)),
    )

    for (let i = 0; i < payloads.length; i++) {
      const { hookPath } = payloads[i]
      const result = results[i]

      // Log timing
      appendTiming({
        timestamp: new Date().toISOString(),
        hook_path: hookPath,
        kind,
        duration_ms: result.durationMs,
        exit_code: result.exitCode,
        surface: 'opencode',
      })

      if (result.stderr && !result.timedOut) {
        process.stderr.write(result.stderr)
        if (!result.stderr.endsWith('\n')) process.stderr.write('\n')
      }

      if (result.timedOut) {
        // D-05: drop silently on timeout for after hooks
        appendFailure({
          timestamp: new Date().toISOString(),
          hook_path: hookPath,
          kind,
          exit_code: 0,
          stderr: `timed out after ${OC_HOOK_TIMEOUT_MS}ms`,
          surface: 'opencode',
        })
        continue
      }

      const parsed = parseHookResult(result.stdout)

      if (parsed.exitCode !== 0) {
        // Advisory: log failure but never throw (D-04)
        appendFailure({
          timestamp: new Date().toISOString(),
          hook_path: hookPath,
          kind,
          exit_code: parsed.exitCode,
          stderr: result.stderr,
          surface: 'opencode',
        })
      }

      // Apply contextMutation for on-large-output (D-07)
      if (kind === 'on-large-output') {
        applyContextMutation(output, parsed.systemInsert)
      }
    }
  }
}
