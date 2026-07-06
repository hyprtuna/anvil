/**
 * src/hooks/wrap.ts — Plan 35 P2: shared validate-and-time wrapper.
 *
 * Extracted from dispatcher.ts so the entrypoint CJS bundle can import
 * validateAndTimeHandler without pulling in on-large-output.ts, which uses
 * import.meta.url (incompatible with esbuild's CJS target without injection).
 *
 * Both dispatcher.ts and entrypoint.ts import from this module.
 * This module's only non-Node deps are core/types.ts and exit-codes.ts,
 * ensuring it bundles cleanly to CJS.
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { getUserHome } from '../core/io/home.js'
import { type HookContext, HookResult } from '../core/types.js'
import { HookExit } from './exit-codes.js'

// ---------------------------------------------------------------------------
// Timing log helpers (shared with dispatcher.ts)
// ---------------------------------------------------------------------------

/** Shape of each entry in ~/.anvil/logs/hook-timings.jsonl. */
export interface TimingEntry {
  ts: string
  kind: string
  handler: string
  durationMs: number
  exitCode: number
  timedOut?: boolean
}

/** Default per-handler hard abort timeout in milliseconds. */
export const DEFAULT_HANDLER_TIMEOUT_MS = 30_000

/**
 * Append a timing entry to ~/.anvil/logs/hook-timings.jsonl.
 * Creates the log directory if absent. Never throws.
 */
export function appendTimingEntry(logPath: string, entry: TimingEntry): void {
  try {
    appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf-8')
  } catch {
    // Best-effort; never abort on log errors.
  }
}

// ---------------------------------------------------------------------------
// Validation failure log helpers (shared with dispatcher.ts)
// ---------------------------------------------------------------------------

/** Maximum entries in the validation-failures JSON array before rotation. */
const VALIDATION_LOG_MAX_ENTRIES = 100
/** Maximum file size for the validation-failures log before rotation (5 MB). */
const VALIDATION_LOG_MAX_BYTES = 5 * 1024 * 1024

interface ValidationFailureEntry {
  ts: string
  kind: string
  handler: string
  rawInputSummary: string
  rawOutput: unknown
  validationErrors: Array<{ path: string; message: string }>
}

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

function writeValidationLog(
  logPath: string,
  entries: ValidationFailureEntry[],
): void {
  try {
    let trimmed = entries
    if (trimmed.length > VALIDATION_LOG_MAX_ENTRIES) {
      trimmed = trimmed.slice(-VALIDATION_LOG_MAX_ENTRIES)
    }
    const serialized = JSON.stringify(trimmed, null, 2)
    if (Buffer.byteLength(serialized, 'utf-8') > VALIDATION_LOG_MAX_BYTES) {
      const half = Math.ceil(trimmed.length / 2)
      writeFileSync(
        logPath,
        JSON.stringify(trimmed.slice(-half), null, 2),
        'utf-8',
      )
    } else {
      writeFileSync(logPath, serialized, 'utf-8')
    }
  } catch {
    // Best-effort.
  }
}

// ---------------------------------------------------------------------------
// Core shared logic
// ---------------------------------------------------------------------------

/**
 * Validate a raw handler return value against HookResult.
 * On failure: log loudly to stderr + validation-failures JSON, return safe fallback.
 */
export function validateOrFallback(
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

  const ctxSummary = (() => {
    try {
      const slim = {
        kind: ctx.kind,
        cwd: ctx.cwd,
        envKeys: Object.keys(ctx.env),
        payload: ctx.payload,
      }
      const s = JSON.stringify(slim)
      return s.length > 500 ? `${s.slice(0, 500)}…` : s
    } catch {
      return '[non-serializable ctx]'
    }
  })()

  const entry: ValidationFailureEntry = {
    ts: new Date().toISOString(),
    kind: hookKind,
    handler: handlerName,
    rawInputSummary: ctxSummary,
    rawOutput: (() => {
      try {
        return JSON.parse(JSON.stringify(raw)) as unknown
      } catch {
        return '[non-serializable]'
      }
    })(),
    validationErrors,
  }

  const logDir = join(getUserHome(), '.anvil', 'logs')
  const logPath = join(logDir, 'hook-validation-failures.json')
  try {
    mkdirSync(logDir, { recursive: true })
    const existing = readValidationLog(logPath)
    existing.push(entry)
    writeValidationLog(logPath, existing)
  } catch {
    // If we can't write, at minimum stderr will surface it.
  }

  process.stderr.write(
    `[anvil:dispatcher] hook output validation FAILED for handler "${handlerName}" (${hookKind}): ` +
      `${validationErrors.map((e) => `${e.path}: ${e.message}`).join('; ')} — ` +
      `returning safe fallback. Full details written to ${logPath}\n`,
  )

  return {
    exitCode: HookExit.SUCCESS,
    message: `anvil: hook output validation failed for "${handlerName}" — see ~/.anvil/logs/hook-validation-failures.json`,
  }
}

/**
 * Plan 35 P2 — shared validate-and-time wrapper used by both the
 * dispatcher loop and the standalone hook entrypoint.
 *
 * Wraps a single handler invocation with:
 *   1. A configurable hard-abort timeout (default 30 s).
 *   2. validateOrFallback at the output boundary.
 *   3. Timing instrumentation to ~/.anvil/logs/hook-timings.jsonl.
 *
 * @param handlerName  Human-readable name for logs.
 * @param kind         Hook kind string (e.g. "session-start").
 * @param ctx          Validated HookContext.
 * @param handler      The async handler function to invoke.
 * @param timeoutMs    Hard-abort timeout in ms (default 30 000).
 */
export async function validateAndTimeHandler(
  handlerName: string,
  kind: string,
  ctx: HookContext,
  handler: (ctx: HookContext) => Promise<unknown>,
  timeoutMs = DEFAULT_HANDLER_TIMEOUT_MS,
): Promise<HookResult> {
  const logDir = join(getUserHome(), '.anvil', 'logs')
  const timingLogPath = join(logDir, 'hook-timings.jsonl')
  try {
    mkdirSync(logDir, { recursive: true })
  } catch {
    // best-effort
  }

  const started = performance.now()
  let timedOut = false
  let raw: unknown

  try {
    const timeoutPromise: Promise<HookResult> = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ exitCode: HookExit.SUCCESS })
      }, timeoutMs)
    })
    const winner = await Promise.race([
      handler(ctx).then((r) => ({ kind: 'handler' as const, value: r })),
      timeoutPromise.then((r) => ({ kind: 'timeout' as const, value: r })),
    ])
    if (winner.kind === 'timeout') {
      timedOut = true
      raw = winner.value
      const thresholdSec = Math.round(timeoutMs / 1000)
      process.stderr.write(
        `[anvil:entrypoint] hook ${handlerName} exceeded ${thresholdSec}s; aborted with safe fallback\n`,
      )
    } else {
      raw = winner.value
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    raw = { exitCode: HookExit.BLOCK, message: `handler threw: ${msg}` }
  }

  const durationMs = performance.now() - started
  const result = validateOrFallback(handlerName, kind, ctx, raw)

  appendTimingEntry(timingLogPath, {
    ts: new Date().toISOString(),
    kind,
    handler: handlerName,
    durationMs,
    exitCode: result.exitCode,
    ...(timedOut ? { timedOut: true } : {}),
  })

  return result
}
