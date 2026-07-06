/**
 * Retry-once classification for the plan-runner (ANV-0025 Wave 4).
 *
 * Layer 0 (core). Pure function — no I/O.
 *
 * Per GSD `phase-runner.ts:91-311`: a task failure is one of three kinds.
 * The runner uses this classification to choose between retry, gate, or
 * block.
 *
 * Categories:
 *
 *   - `transient`     — environmental flake (timeout, ECONNRESET, EAI_AGAIN,
 *                       rate-limit). Safe to retry once. After a second
 *                       failure the runner escalates to `gate-required`.
 *   - `deterministic` — assertion failure, compile error, type-check error,
 *                       missing-file. Retrying is wasted work; the runner
 *                       requests a human gate.
 *   - `gate-required` — the caller explicitly tagged the failure as needing
 *                       human review, OR the heuristics gave up. Same
 *                       runner action as `deterministic` but distinguishable
 *                       in reports.
 *
 * The taxonomy is intentionally narrow. The runner does not need a fine
 * classifier; it needs a binary "retry or escalate" decision. We keep
 * `deterministic` and `gate-required` separate so reports can surface the
 * difference (and so a future ticket can add policy without re-shaping
 * this API).
 */

/** What the runner should do with a task failure. */
export type ErrorClassification =
  | 'transient'
  | 'deterministic'
  | 'gate-required'

export interface TaskFailureInfo {
  taskId: string
  attempt: number
  error?: { message: string; classification?: string }
}

/**
 * Patterns that signal a transient/retryable error.
 *
 * Kept as plain regexes so a future ticket can ship a config-driven
 * override map without re-shaping the API.
 */
const TRANSIENT_PATTERNS: readonly RegExp[] = [
  /\btimeout\b/i,
  /\btimed out\b/i,
  /\bECONNRESET\b/,
  /\bECONNREFUSED\b/,
  /\bEAI_AGAIN\b/,
  /\bETIMEDOUT\b/,
  /\bENOTFOUND\b/,
  /\brate ?limit/i,
  /\b429\b/,
  /\b503\b/,
  /\btemporar(y|ily)\b/i,
  /\bflake/i,
]

/**
 * Patterns that signal a deterministic (not-worth-retrying) error.
 *
 * Order matters: deterministic is checked AFTER transient because some
 * errors mention both (e.g. "compile error after timeout retry"). The
 * transient win on overlap is intentional — retrying a marginal case
 * once is cheap; escalating to a gate is expensive.
 */
const DETERMINISTIC_PATTERNS: readonly RegExp[] = [
  /\bassertion failed\b/i,
  /\bassert(?:ionerror)?\b/i,
  /\bsyntax ?error\b/i,
  /\btype ?error\b/i,
  /\btypecheck failed\b/i,
  /\bcompile (?:error|failed)\b/i,
  /\bno such file\b/i,
  /\bcannot find module\b/i,
  /\bENOENT\b/,
  /\binvalid argument\b/i,
  /\bunexpected token\b/i,
]

/**
 * Pick the runner action for a task failure.
 *
 * Decision rules (first match wins):
 *   1. Caller-supplied `error.classification === 'gate-required'` → gate-required.
 *   2. Caller-supplied `error.classification === 'transient'`     → transient.
 *   3. Caller-supplied `error.classification === 'deterministic'` → deterministic.
 *   4. Message matches a transient pattern → transient.
 *   5. Message matches a deterministic pattern → deterministic.
 *   6. No signal → gate-required (conservative default: ask a human).
 */
export function classifyError(failure: TaskFailureInfo): ErrorClassification {
  const tag = failure.error?.classification?.toLowerCase()
  if (tag === 'gate-required' || tag === 'gate_required') return 'gate-required'
  if (tag === 'transient') return 'transient'
  if (tag === 'deterministic') return 'deterministic'

  const message = failure.error?.message ?? ''
  for (const pattern of TRANSIENT_PATTERNS) {
    if (pattern.test(message)) return 'transient'
  }
  for (const pattern of DETERMINISTIC_PATTERNS) {
    if (pattern.test(message)) return 'deterministic'
  }
  return 'gate-required'
}
