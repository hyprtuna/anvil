import { execSync } from 'node:child_process'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { HookRegistry } from '../core/registry/hook-registry.js'
import { redact } from '../core/security/redact.js'
import {
  type HookContext,
  type HookHandlerProfileManifest,
  HookResult,
  type LargeOutputResult,
  type ModelsConfig,
} from '../core/types.js'
import { HookExit, type HookExitCode } from './exit-codes.js'
import {
  countWords,
  estimateTokens,
  handleLargeOutput,
} from './handlers/on-large-output.js'
import {
  SESSION_START_BUDGET_CHARS,
  type SessionStartFragment,
  aggregateSessionStartContext,
} from './handlers/session-start/budget.js'
import { evaluateIf } from './match.js'
import { dedupeDirectives } from './system-directive.js'

// E-004: dedupe malformed-matcher stderr warnings per process (D-01).
const reportedBadMatchers = new Set<string>()

// ---------------------------------------------------------------------------
// ANV-0056 — SessionStart overrun telemetry
// ---------------------------------------------------------------------------

/** Filename for the session-start context overrun log (ANV-0056). */
export const SESSION_START_OVERRUN_LOG_FILENAME = 'session-start-overruns.jsonl'

/** Returns the absolute path to the session-start overrun log. */
export function getSessionStartOverrunLogPath(): string {
  return join(homedir(), '.anvil', 'logs', SESSION_START_OVERRUN_LOG_FILENAME)
}

/** Shape of each overrun entry appended to the overrun log. */
interface SessionStartOverrunEntry {
  ts: string
  budgetChars: number
  usedChars: number
  includedCount: number
  droppedCount: number
}

/**
 * Append a session-start overrun entry to the rolling JSONL log.
 * Keeps the last 7 days of entries (same rotation policy as hook-timings.jsonl).
 * Never throws.
 */
function appendSessionStartOverrun(entry: SessionStartOverrunEntry): void {
  try {
    const logPath = getSessionStartOverrunLogPath()
    const logDir = join(homedir(), '.anvil', 'logs')
    mkdirSync(logDir, { recursive: true })
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // Best-effort; never abort on log errors.
  }
}

// ---------------------------------------------------------------------------

/** Default blocking-hook budget in milliseconds (T4.4). */
export const DEFAULT_BLOCKING_BUDGET_MS = 200
/** Default async-hook budget in milliseconds (T4.4). */
export const DEFAULT_ASYNC_BUDGET_MS = 30_000

export interface DispatchBudgets {
  blockingMs?: number
  asyncMs?: number
}

/** Default per-handler hard abort timeout in milliseconds (Plan 34 C4). */
export const DEFAULT_HANDLER_TIMEOUT_MS = 30_000

// ---------------------------------------------------------------------------
// Phase G — async handler support
// ---------------------------------------------------------------------------

/** Phase G: per-async-handler timeout budget in milliseconds (5 seconds). */
export const ASYNC_HANDLER_TIMEOUT_MS = 5_000

/** Phase G: filename for the async-failure log. */
export const ASYNC_FAILURE_LOG_FILENAME = 'hook-async-failures.json'

/** Phase G: returns the absolute path to the async-failure log file. */
export function getAsyncFailureLogPath(): string {
  return join(homedir(), '.anvil', 'logs', ASYNC_FAILURE_LOG_FILENAME)
}

/** Shape of each entry in the async-failure log. */
interface AsyncFailureEntry {
  timestamp: string
  handler_name: string
  event_type: string
  error_message: string
  stack?: string
}

const ASYNC_FAILURE_LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/**
 * Append an async-failure entry to ~/.anvil/logs/hook-async-failures.json.
 * Rotates entries older than 7 days. Never throws.
 */
function appendAsyncFailure(entry: AsyncFailureEntry): void {
  try {
    const logPath = getAsyncFailureLogPath()
    const logDir = join(homedir(), '.anvil', 'logs')
    mkdirSync(logDir, { recursive: true })

    let entries: AsyncFailureEntry[] = []
    if (existsSync(logPath)) {
      try {
        const raw = readFileSync(logPath, 'utf-8').trim()
        if (raw) {
          const parsed = JSON.parse(raw) as unknown
          if (Array.isArray(parsed)) entries = parsed as AsyncFailureEntry[]
        }
      } catch {
        entries = []
      }
    }

    // Rotate entries older than 7 days
    const cutoff = Date.now() - ASYNC_FAILURE_LOG_MAX_AGE_MS
    entries = entries.filter((e) => {
      try {
        return new Date(e.timestamp).getTime() >= cutoff
      } catch {
        return false
      }
    })

    entries.push(entry)
    writeFileSync(logPath, JSON.stringify(entries, null, 2), 'utf-8')
  } catch {
    // Best-effort; never abort on log errors.
  }
}

/**
 * Phase G: Fire an async handler in the background via setImmediate.
 * Bounded to ASYNC_HANDLER_TIMEOUT_MS (5s). On timeout or error,
 * logs to ~/.anvil/logs/hook-async-failures.json.
 */
function fireAsync(
  h: {
    name: string
    kind: string
    handler: (ctx: HookContext) => Promise<unknown>
  },
  ctx: HookContext,
): void {
  setImmediate(() => {
    const timeoutId = setTimeout(() => {
      const entry: AsyncFailureEntry = {
        timestamp: new Date().toISOString(),
        handler_name: h.name,
        event_type: h.kind,
        error_message: `async handler timed out after ${ASYNC_HANDLER_TIMEOUT_MS}ms`,
      }
      appendAsyncFailure(entry)
      process.stderr.write(
        redact(
          `[anvil:dispatcher] async handler ${h.name} timed out after ${ASYNC_HANDLER_TIMEOUT_MS}ms\n`,
        ),
      )
    }, ASYNC_HANDLER_TIMEOUT_MS)

    Promise.resolve(h.handler(ctx))
      .then(() => {
        clearTimeout(timeoutId)
      })
      .catch((err: unknown) => {
        clearTimeout(timeoutId)
        const msg = redact(err instanceof Error ? err.message : String(err))
        const stack =
          err instanceof Error && err.stack ? redact(err.stack) : undefined
        const entry: AsyncFailureEntry = {
          timestamp: new Date().toISOString(),
          handler_name: h.name,
          event_type: h.kind,
          error_message: msg,
          ...(stack ? { stack } : {}),
        }
        appendAsyncFailure(entry)
        process.stderr.write(
          redact(`[anvil:dispatcher] async handler ${h.name} failed: ${msg}\n`),
        )
      })
  })
}

export interface DispatchOptions {
  stopOnBlock?: boolean
  /** Override the default blocking/async budgets (T4.4). */
  budgets?: DispatchBudgets
  /**
   * Plan 34 C4 — per-handler hard abort timeout in milliseconds.
   * If omitted, reads from `ctx.config.hooks.timeout_seconds` (default 30s).
   * Any handler that exceeds this limit is aborted; dispatcher returns
   * {exitCode: 0} with a loud stderr warning (never silent).
   */
  timeoutMs?: number
}

/**
 * Per-hook trace entry (T4.5). Captured for every hook that ran in this
 * dispatch cycle, successful or not. Consumers (anvil doctor --hooks, the
 * TUI log panel) render these as-is.
 */
export interface DispatchTraceEntry {
  hookName: string
  kind: string
  exitCode: HookExitCode
  elapsedMs: number
  priority: number
  message?: string
  /** True when this hook exceeded its budget (T4.4). */
  budgetExceeded?: boolean
  /** Plan 34 C4. True when this hook was aborted by the hard timeout safeguard. */
  timedOut?: boolean
  /** Plan 28 D4. True when matcher / if ruled the hook out before invoking. */
  skipped?: boolean
  /** Plan 28 D4. Reason a skipped hook was filtered. */
  skipReason?: 'matcher' | 'if'
}

export interface DispatchResult {
  exitCode: HookExitCode
  messages: string[]
  /** Per-hook trace. One entry per executed handler in dispatch order. */
  trace: DispatchTraceEntry[]
  /**
   * ANV-0049 — merged, deduplicated model-visible system directive string.
   *
   * Collected from every handler's `result.systemInsert` in dispatch order,
   * then deduped via `dedupeDirectives()` so at most one directive per
   * `SystemDirectiveType` tag reaches the model per turn.
   *
   * Absent when no handler emitted a `systemInsert`.
   */
  systemInsert?: string
  /**
   * Plan 32 C2 — populated when an `on-large-output` handler ran and returned
   * a summary. Callers (adapters, agent runner) must replace the tool result
   * in conversation context with:
   *   `${contextMutation.summary}\n\nsee notepad: ${contextMutation.stashedAt}`
   * When absent or when `skip: true`, the caller leaves the original output intact.
   */
  contextMutation?: LargeOutputResult
  /**
   * ANV-0056 — populated for `session-start` dispatches. Contains the
   * priority-ordered, budget-capped aggregate of all session-start handler
   * `systemInsert` outputs. When the budget is exceeded, lower-priority
   * outputs are dropped and a "[truncated to fit N char budget]" notice is
   * appended. Undefined when no handlers emitted `systemInsert`.
   */
  sessionStartContext?: string
}

// ---------------------------------------------------------------------------
// Plan 34 C1 — Hook timing instrumentation
// ---------------------------------------------------------------------------

/** Shape of each entry in ~/.anvil/logs/hook-timings.jsonl. */
interface TimingEntry {
  ts: string
  kind: string
  handler: string
  durationMs: number
  exitCode: number
  timedOut?: boolean
}

const TIMING_LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
const TIMING_LOG_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/**
 * Rotate the timing log if it exceeds age or size limits.
 * Called once at the start of each dispatch invocation (cheap stat check).
 * Drops entries older than 7 days first; if file still > 10 MB, keeps only
 * the most recent half by line count.
 */
function rotateTimingLog(logPath: string): void {
  try {
    if (!existsSync(logPath)) return
    const s = statSync(logPath)
    const needsRotation = s.size > TIMING_LOG_MAX_BYTES
    const raw = readFileSync(logPath, 'utf-8')
    const lines = raw.split('\n').filter(Boolean)
    const cutoff = Date.now() - TIMING_LOG_MAX_AGE_MS

    // Always drop entries older than 7 days
    let filtered = lines.filter((line) => {
      try {
        const entry = JSON.parse(line) as { ts?: string }
        if (!entry.ts) return false
        return new Date(entry.ts).getTime() >= cutoff
      } catch {
        return false
      }
    })

    // If file still exceeds max size, keep the most recent half
    if (needsRotation && filtered.length > 0) {
      const half = Math.ceil(filtered.length / 2)
      filtered = filtered.slice(-half)
    }

    writeFileSync(
      logPath,
      filtered.join('\n') + (filtered.length > 0 ? '\n' : ''),
      'utf-8',
    )
  } catch {
    // Rotation is best-effort; never abort dispatch on log errors.
  }
}

/**
 * Append a timing entry to ~/.anvil/logs/hook-timings.jsonl.
 * Creates the log directory if absent. Never throws.
 */
function appendTimingEntry(logPath: string, entry: TimingEntry): void {
  try {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // Best-effort; never abort dispatch on log errors.
  }
}

/**
 * Dispatch stage classification (T4.4). `user-prompt-submit` and
 * `pre-tool-use` are blocking — they gate the caller's next action, so
 * budgets are tight. Everything else is async.
 */
function isBlockingStage(kind: string): boolean {
  return kind === 'user-prompt-submit' || kind === 'pre-tool-use'
}

/**
 * CC matcher semantics: empty string = "match everything"; a literal value
 * matches the tool name exactly; a value containing regex metacharacters
 * is interpreted as an anchored regex. Falsy payload tool name with a
 * non-empty matcher means no match.
 */
function payloadMatchesMatcher(payload: unknown, matcher: string): boolean {
  if (matcher.length === 0) return true
  const tool = readPayloadTool(payload)
  if (tool === undefined) return false
  if (/[.*+?()\\[\]{}|^$]/.test(matcher)) {
    try {
      return new RegExp(`^(?:${matcher})$`).test(tool)
    } catch {
      if (!reportedBadMatchers.has(matcher)) {
        reportedBadMatchers.add(matcher)
        process.stderr.write(
          redact(
            `[anvil] dispatcher: malformed matcher regex (skipped): ${matcher}\n`,
          ),
        )
      }
      return false
    }
  }
  return tool === matcher
}

function readPayloadTool(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined
  const p = payload as Record<string, unknown>
  for (const key of ['tool_name', 'tool', 'name']) {
    const v = p[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Plan 34 D1 — Hook validation failure telemetry
// ---------------------------------------------------------------------------

/** Maximum entries in the validation-failures JSON array before rotation. */
const VALIDATION_LOG_MAX_ENTRIES = 100
/** Maximum file size for the validation-failures log before rotation (5 MB). */
const VALIDATION_LOG_MAX_BYTES = 5 * 1024 * 1024

/**
 * Shape of each entry in ~/.anvil/logs/hook-validation-failures.json.
 * Conforms to Plan 34 D1 spec: ts, kind, handler, rawInputSummary, rawOutput, validationErrors.
 */
interface ValidationFailureEntry {
  ts: string
  kind: string
  handler: string
  /** First 500 chars of the stringified HookContext (excluding config to reduce noise). */
  rawInputSummary: string
  /** The raw return value from the handler, exactly as returned (unknown shape). */
  rawOutput: unknown
  /** Zod issues array — each entry is { path, message }. */
  validationErrors: Array<{ path: string; message: string }>
}

/**
 * Read the current validation-failures log. Returns an empty array on any
 * read/parse error so the caller always gets a writable array.
 */
function readValidationLog(logPath: string): ValidationFailureEntry[] {
  try {
    if (!existsSync(logPath)) return []
    const content = readFileSync(logPath, 'utf-8').trim()
    if (!content) return []
    const parsed = JSON.parse(content) as unknown
    if (Array.isArray(parsed)) return parsed as ValidationFailureEntry[]
    return []
  } catch {
    return []
  }
}

/**
 * Write the validation-failures log as a JSON array.
 * Truncates entries exceeding VALIDATION_LOG_MAX_ENTRIES or
 * VALIDATION_LOG_MAX_BYTES — keeps the most recent entries.
 * Never throws.
 */
function writeValidationLog(
  logPath: string,
  entries: ValidationFailureEntry[],
): void {
  try {
    let trimmed = entries
    // Rotate: keep the most recent N entries.
    if (trimmed.length > VALIDATION_LOG_MAX_ENTRIES) {
      trimmed = trimmed.slice(-VALIDATION_LOG_MAX_ENTRIES)
    }
    const serialized = JSON.stringify(trimmed, null, 2)
    // Secondary guard: if the serialized content still exceeds 5 MB,
    // keep only the most recent half.
    if (Buffer.byteLength(serialized, 'utf-8') > VALIDATION_LOG_MAX_BYTES) {
      const half = Math.ceil(trimmed.length / 2)
      const halfEntries = trimmed.slice(-half)
      writeFileSync(logPath, JSON.stringify(halfEntries, null, 2), 'utf-8')
    } else {
      writeFileSync(logPath, serialized, 'utf-8')
    }
  } catch {
    // Best-effort; never abort dispatch on log errors.
  }
}

/**
 * Plan 33 J3 / Plan 34 D1 — Dispatcher boundary validation guard.
 *
 * Validates a raw handler return value against the HookResult Zod schema.
 * On failure:
 *   - Logs a structured entry to ~/.anvil/logs/hook-validation-failures.json
 *     (a JSON array; rotates after 100 entries OR 5 MB, whichever first).
 *     Entry shape: { ts, kind, handler, rawInputSummary, rawOutput, validationErrors }
 *   - Writes to stderr so the operator always sees it (loud, never silent).
 *   - Returns a safe fallback shape so the host (CC) never sees an invalid payload.
 *
 * This is the last line of defence before results leave the Anvil process.
 */
function validateOrFallback(
  handlerName: string,
  hookKind: string,
  ctx: HookContext,
  raw: unknown,
): HookResult {
  const parsed = HookResult.safeParse(raw)
  if (parsed.success) return parsed.data

  const validationErrors = parsed.error.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }))

  // Build input summary: stringify a subset of ctx (exclude full config to
  // reduce noise; include kind, cwd, env keys, and first 500 chars of payload).
  // Redact before persisting so the log file never contains raw tokens.
  const ctxSummary = (() => {
    try {
      const slim = {
        kind: ctx.kind,
        cwd: ctx.cwd,
        envKeys: Object.keys(ctx.env),
        payload: ctx.payload,
      }
      const s = JSON.stringify(slim)
      const truncated = s.length > 500 ? `${s.slice(0, 500)}…` : s
      return redact(truncated)
    } catch {
      return '[non-serializable ctx]'
    }
  })()

  const rawOutputRedacted = (() => {
    try {
      const serialized = JSON.stringify(raw)
      return JSON.parse(redact(serialized)) as unknown
    } catch {
      return '[non-serializable]'
    }
  })()

  const entry: ValidationFailureEntry = {
    ts: new Date().toISOString(),
    kind: hookKind,
    handler: handlerName,
    rawInputSummary: ctxSummary,
    rawOutput: rawOutputRedacted,
    validationErrors,
  }

  const logDir = join(homedir(), '.anvil', 'logs')
  const logPath = join(logDir, 'hook-validation-failures.json')
  try {
    mkdirSync(logDir, { recursive: true })
    const existing = readValidationLog(logPath)
    existing.push(entry)
    writeValidationLog(logPath, existing)
  } catch {
    // If we can't write the log, at minimum write to stderr so it surfaces.
  }

  // Always write to stderr so the operator sees it regardless of log write success.
  process.stderr.write(
    redact(
      `[anvil:dispatcher] hook output validation FAILED for handler "${handlerName}" (${hookKind}): ` +
        `${validationErrors.map((e) => `${e.path}: ${e.message}`).join('; ')} — ` +
        `returning safe fallback. Full details written to ${logPath}\n`,
    ),
  )

  return {
    exitCode: HookExit.SUCCESS,
    message: `anvil: hook output validation failed for "${handlerName}" — see ~/.anvil/logs/hook-validation-failures.json`,
  }
}

/**
 * ANV-0128 — Resolve the active profile name for a hook handler.
 *
 * Precedence (highest wins):
 *   1. `config.hooks.<handler-name>.profile` (user override).
 *      Ignored when the named profile is not declared in the manifest.
 *   2. `manifest.defaultProfile` (handler default).
 *   3. `undefined` (legacy / no profile branching).
 *
 * Pure — no I/O. Exported for unit-test coverage and for downstream
 * consumers (e.g., the doctor row) that need to render the active profile.
 */
export function resolveActiveProfile(
  handlerName: string,
  config: ModelsConfig,
  manifest: HookHandlerProfileManifest | undefined,
): string | undefined {
  if (!manifest) return undefined
  const entry = config.hooks?.[handlerName] as { profile?: unknown } | undefined
  const configured =
    entry && typeof entry === 'object' && typeof entry.profile === 'string'
      ? entry.profile
      : undefined
  if (configured && configured in manifest.profiles) {
    return configured
  }
  if (manifest.defaultProfile && manifest.defaultProfile in manifest.profiles) {
    return manifest.defaultProfile
  }
  return undefined
}

export async function dispatch(
  registry: HookRegistry,
  ctx: HookContext,
  opts: DispatchOptions = {},
): Promise<DispatchResult> {
  const blockingBudgetMs =
    opts.budgets?.blockingMs ?? DEFAULT_BLOCKING_BUDGET_MS
  const asyncBudgetMs = opts.budgets?.asyncMs ?? DEFAULT_ASYNC_BUDGET_MS
  const budgetMs = isBlockingStage(ctx.kind) ? blockingBudgetMs : asyncBudgetMs

  // Plan 34 C1 — timing log setup: create dir + rotate on each dispatch call.
  const logDir = join(homedir(), '.anvil', 'logs')
  const timingLogPath = join(logDir, 'hook-timings.jsonl')
  try {
    mkdirSync(logDir, { recursive: true })
  } catch {
    // best-effort
  }
  rotateTimingLog(timingLogPath)

  // Plan 34 C4 — per-handler hard abort timeout.
  // Preference order: explicit opts.timeoutMs → config.hooks.timeout_seconds → 30s default.
  const handlerTimeoutMs =
    opts.timeoutMs ??
    (ctx.config.hooks?.timeout_seconds != null
      ? ctx.config.hooks.timeout_seconds * 1000
      : DEFAULT_HANDLER_TIMEOUT_MS)

  const registered = registry
    .getAll()
    .filter((h) => h.kind === ctx.kind && h.enabled)
    .slice()
    .sort((a, b) =>
      a.priority !== b.priority
        ? b.priority - a.priority
        : a.insertionOrder - b.insertionOrder,
    )
  const messages: string[] = []
  const trace: DispatchTraceEntry[] = []
  // ANV-0049: collect systemInsert values for post-loop dedupe.
  const systemInserts: string[] = []
  let worst: HookExitCode = HookExit.SUCCESS

  // ANV-0056 — collect session-start systemInsert fragments for budget aggregation.
  const sessionStartFragments: SessionStartFragment[] = []

  for (const h of registered) {
    // Plan 28 D4: evaluate matcher (CC-style literal/regex on tool_name) and
    // `if` (permission-rule predicates) before invoking. Skipped hooks emit
    // a trace entry so doctor / `anvil hooks list` can surface why a hook
    // didn't fire.
    if (
      h.matcher !== undefined &&
      !payloadMatchesMatcher(ctx.payload, h.matcher)
    ) {
      trace.push({
        hookName: h.name,
        kind: h.kind,
        exitCode: HookExit.SUCCESS,
        elapsedMs: 0,
        priority: h.priority,
        skipped: true,
        skipReason: 'matcher',
      })
      continue
    }
    if (h.ifRules !== undefined && !evaluateIf(h.ifRules, ctx.payload)) {
      trace.push({
        hookName: h.name,
        kind: h.kind,
        exitCode: HookExit.SUCCESS,
        elapsedMs: 0,
        priority: h.priority,
        skipped: true,
        skipReason: 'if',
      })
      continue
    }

    // Phase G — async handler: fire and forget via setImmediate.
    // Async handlers do NOT participate in exitCode/message aggregation.
    if (h.async) {
      // ANV-0128 — also thread active profile through async handler ctx.
      const asyncProfile = resolveActiveProfile(
        h.name,
        ctx.config,
        h.profileManifest,
      )
      const asyncCtx: HookContext =
        asyncProfile !== undefined ? { ...ctx, profile: asyncProfile } : ctx
      fireAsync(h, asyncCtx)
      trace.push({
        hookName: h.name,
        kind: h.kind,
        exitCode: HookExit.SUCCESS,
        elapsedMs: 0,
        priority: h.priority,
        skipped: true,
        skipReason: 'matcher', // reuse 'matcher' as "dispatched async"
      })
      continue
    }

    // ANV-0128 — Resolve the active profile for this handler and thread it
    // through a per-call context. Handlers without a manifest receive
    // ctx.profile === undefined (legacy behavior).
    const activeProfile = resolveActiveProfile(
      h.name,
      ctx.config,
      h.profileManifest,
    )
    const handlerCtx: HookContext =
      activeProfile !== undefined ? { ...ctx, profile: activeProfile } : ctx

    let result: HookResult
    let timedOut = false
    const started = performance.now()
    try {
      // Plan 34 C4 — race handler against hard timeout.
      // On timeout: log to stderr (loud, never silent per anvil:silent-failure-hunter),
      // return safe {exitCode: 0} so the host is never blocked.
      const timeoutPromise: Promise<HookResult> = new Promise((resolve) => {
        setTimeout(() => {
          resolve({ exitCode: HookExit.SUCCESS })
        }, handlerTimeoutMs)
      })
      const handlerPromise: Promise<unknown> = h.handler(handlerCtx)
      let raw: unknown
      const winner = await Promise.race([
        handlerPromise.then((r) => ({ kind: 'handler' as const, value: r })),
        timeoutPromise.then((r) => ({ kind: 'timeout' as const, value: r })),
      ])
      if (winner.kind === 'timeout') {
        timedOut = true
        raw = winner.value
        const thresholdSec = Math.round(handlerTimeoutMs / 1000)
        process.stderr.write(
          redact(
            `[anvil:dispatcher] hook ${h.name} exceeded ${thresholdSec}s; aborted with safe fallback\n`,
          ),
        )
      } else {
        raw = winner.value
      }
      // Plan 33 J3 / Plan 34 D1: validate shape at the dispatcher boundary before
      // using result. On failure, logs loudly (with input/output capture) and
      // returns a safe fallback (never silent).
      result = validateOrFallback(h.name, h.kind, handlerCtx, raw)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result = { exitCode: HookExit.BLOCK, message: `handler threw: ${msg}` }
    }
    const elapsedMs = performance.now() - started
    const budgetExceeded = !timedOut && elapsedMs > budgetMs
    if (budgetExceeded) {
      // eslint-disable-next-line no-console
      console.warn(
        `[anvil] hook ${h.name} exceeded ${isBlockingStage(ctx.kind) ? 'blocking' : 'async'} budget (${elapsedMs.toFixed(0)}ms > ${budgetMs}ms)`,
      )
    }

    // Plan 34 C1 — append timing entry to JSONL log.
    appendTimingEntry(timingLogPath, {
      ts: new Date().toISOString(),
      kind: h.kind,
      handler: h.name,
      durationMs: Math.round(elapsedMs),
      exitCode: result.exitCode as number,
      ...(timedOut ? { timedOut: true } : {}),
    })

    if (result.message) messages.push(redact(`[${h.name}] ${result.message}`))
    // ANV-0049: collect raw systemInsert for post-loop dedupe.
    if (result.systemInsert) systemInserts.push(result.systemInsert)
    if (result.exitCode > worst) worst = result.exitCode as HookExitCode

    // ANV-0056 — collect systemInsert for session-start budget aggregation.
    if (ctx.kind === 'session-start' && result.systemInsert !== undefined) {
      sessionStartFragments.push({
        name: h.name,
        priority: h.priority,
        systemInsert: result.systemInsert,
      })
    }

    trace.push({
      hookName: h.name,
      kind: h.kind,
      exitCode: result.exitCode as HookExitCode,
      elapsedMs,
      priority: h.priority,
      ...(result.message ? { message: redact(result.message) } : {}),
      ...(budgetExceeded ? { budgetExceeded: true } : {}),
      ...(timedOut ? { timedOut: true } : {}),
    })

    if (opts.stopOnBlock && result.exitCode === HookExit.BLOCK) break
  }

  // ANV-0056 — SessionStart aggregate context budget.
  // Apply budget aggregation to all collected session-start systemInsert fragments.
  // The budget is read from config; falls back to SESSION_START_BUDGET_CHARS (6000).
  let sessionStartContext: string | undefined
  if (ctx.kind === 'session-start' && sessionStartFragments.length > 0) {
    const budgetChars =
      ctx.config.hooks?.session_start?.budget_chars ??
      SESSION_START_BUDGET_CHARS
    const agg = aggregateSessionStartContext(sessionStartFragments, budgetChars)
    sessionStartContext = agg.aggregated

    if (agg.truncated) {
      appendSessionStartOverrun({
        ts: new Date().toISOString(),
        budgetChars,
        usedChars: agg.usedChars,
        includedCount: agg.includedCount,
        droppedCount: agg.droppedCount,
      })
      process.stderr.write(
        `[anvil:dispatcher] session-start context truncated: ${agg.droppedCount} fragment(s) dropped (budget ${budgetChars} chars, used ${agg.usedChars} chars)\n`,
      )
    }
  }

  // Plan 32 C2 — on-large-output wiring.
  // After post-tool-use completes, check whether the tool result exceeds the
  // compression threshold. If so, fire the on-large-output handler and attach
  // the mutation to the result so callers can replace the context payload.
  let contextMutation: LargeOutputResult | undefined
  if (ctx.kind === 'post-tool-use') {
    const threshold = ctx.config.compression?.threshold_words ?? 5000
    const payload = ctx.payload as Record<string, unknown> | null
    const toolResult = typeof payload?.result === 'string' ? payload.result : ''
    const words = countWords(toolResult)

    if (words >= threshold && toolResult.length > 0) {
      const toolName =
        typeof payload?.tool === 'string' ? payload.tool : 'unknown'
      const branch =
        typeof payload?.branch === 'string'
          ? payload.branch
          : detectBranchFromCwd(ctx.cwd)
      const tokens = estimateTokens(toolResult)

      const largeOutputPayload = {
        toolName,
        toolResult,
        words,
        tokens,
        branch,
        cwd: ctx.cwd,
      }

      try {
        const result = await handleLargeOutput(largeOutputPayload, ctx.config)
        if (!result.skip && result.summary) {
          contextMutation = result
        }
      } catch (err) {
        // Non-fatal — log and continue
        process.stderr.write(
          redact(
            `[anvil:dispatcher] on-large-output failed: ${err instanceof Error ? err.message : String(err)}\n`,
          ),
        )
      }
    }
  }

  // ANV-0049: dedupe collected systemInserts by directive type.
  const mergedSystemInsert = dedupeDirectives(systemInserts)

  return {
    exitCode: worst,
    messages,
    trace,
    ...(mergedSystemInsert ? { systemInsert: mergedSystemInsert } : {}),
    ...(contextMutation ? { contextMutation } : {}),
    ...(sessionStartContext !== undefined ? { sessionStartContext } : {}),
  }
}

/**
 * Detect the current git branch from a working directory.
 * Returns 'main' on failure (safe non-empty default for stash paths).
 */
function detectBranchFromCwd(cwd: string): string {
  try {
    const branch = execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return branch || 'main'
  } catch {
    return 'main'
  }
}
