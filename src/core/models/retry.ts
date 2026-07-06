/**
 * src/core/models/retry.ts
 *
 * Retry triage helper for SDK errors encountered during model invocations
 * (Plan 33 D3). Shared between the agent runner (src/agents/runner.ts) and
 * the skill runtime (src/skills/runtime.ts).
 *
 * Whitelisted retryable codes:
 *   - model_not_available  — temporary model routing issue; chain is the fix
 *   - rate_limit_exceeded  — transient capacity cap; next chain entry may be free
 *
 * Not retried (caller should surface immediately):
 *   - Auth failures (authentication_error, permission_error)
 *   - Malformed request errors (invalid_request_error)
 *   - OS-level network errors (ECONNREFUSED, ENOTFOUND) — these need
 *     different handling (connection retry with backoff) outside scope for now
 */

/** Retryable SDK error codes (whitelist). */
const RETRYABLE_CODES = new Set<string>([
  'model_not_available',
  'rate_limit_exceeded',
])

/**
 * Returns true iff `err` is a transient SDK error that warrants trying the
 * next `fallback_chain` entry.
 *
 * Accepts any `unknown` value — callers may catch `unknown` in strict TS.
 */
export function isRetryableSDKError(err: unknown): boolean {
  if (err === null || err === undefined) return false
  if (typeof err !== 'object') return false
  const code = (err as Record<string, unknown>).code
  if (typeof code !== 'string') return false
  return RETRYABLE_CODES.has(code)
}
