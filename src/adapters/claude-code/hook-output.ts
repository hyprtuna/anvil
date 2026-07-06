/**
 * Claude Code hook output formatter (Plan 31 B2 — Path E injection).
 *
 * Formats HookResult output for Claude Code hooks so that `systemInsert`
 * reaches the model via `hookSpecificOutput.additionalContext` (10KB cap,
 * model-visible).
 *
 * This module lives at Layer 5 (adapters). It is imported by the hook
 * entrypoint via the Layer-2 re-export in src/hooks/cc-output.ts to avoid
 * a direct cross-layer import from entrypoint.ts.
 *
 * Reference: https://code.claude.com/docs/en/hooks.md
 */

import type { HookResult } from '../../core/types.js'
import type { DispatchResult } from '../../hooks/dispatcher.js'

/** Hard cap for additionalContext: 10,240 bytes (10KB). */
export const CC_HOOK_OUTPUT_MAX_BYTES = 10_240

/** Truncation suffix appended when content exceeds the cap. */
export const TRUNCATION_SUFFIX = '\n…(truncated)'

/**
 * Truncate `text` so that the UTF-8 encoding fits within `maxBytes`.
 * The cut is made at the minimum of:
 *   (a) the last whole UTF-8 codepoint boundary at or before maxBytes, and
 *   (b) the last newline boundary at or before that codepoint boundary.
 *
 * Multi-byte codepoints are never split. The TRUNCATION_SUFFIX is appended.
 */
export function truncateUtf8Safe(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8')
  if (buf.byteLength <= maxBytes) return text

  // Walk backwards from maxBytes to find the last whole codepoint boundary.
  let cpBoundary = maxBytes
  while (cpBoundary > 0 && (buf[cpBoundary]! & 0xc0) === 0x80) {
    cpBoundary--
  }

  // Decode to string then walk backwards to the last newline boundary.
  const asString = buf.subarray(0, cpBoundary).toString('utf8')
  const lastNewline = asString.lastIndexOf('\n')
  const kept = lastNewline > 0 ? asString.slice(0, lastNewline) : asString

  return kept + TRUNCATION_SUFFIX
}

/**
 * Format a HookResult for Claude Code's stdout channel.
 *
 * Returns `{ stdout, stderr }`. The caller writes each to the appropriate fd.
 *
 * Behaviour:
 * - `systemInsert` present → stdout = JSON additionalContext envelope (≤10KB);
 *   stderr = message (if set) — both channels delivered without mixing.
 * - `message` only → stdout = plain text; stderr = '' (legacy behaviour).
 * - Neither → both ''.
 */
export function formatClaudeCodeHookOutput(
  hookEventName: string,
  result: HookResult,
): { stdout: string; stderr: string } {
  if (result.systemInsert !== undefined) {
    const safe = truncateUtf8Safe(result.systemInsert, CC_HOOK_OUTPUT_MAX_BYTES)
    const envelope = JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: safe,
      },
    })
    return {
      stdout: envelope,
      stderr: result.message ?? '',
    }
  }

  return {
    stdout: result.message ?? '',
    stderr: '',
  }
}

/**
 * Format a DispatchResult for Claude Code's stdout channel.
 *
 * ANV-0056 — SessionStart aggregate budget wiring.
 *
 * When `dispatch.sessionStartContext` is set (i.e., this was a session-start
 * dispatch with aggregated handler outputs), uses the pre-aggregated string
 * as the SOLE `additionalContext` payload. Per-handler `systemInsert` values
 * are NOT emitted individually; the aggregator already handled budget and
 * priority ordering.
 *
 * When `sessionStartContext` is absent (non-session-start dispatch or no
 * handler emitted systemInsert), falls back to collecting all per-result
 * systemInserts. If multiple results carry systemInsert, they are joined
 * with a blank-line separator and the combined string is used.
 *
 * Returns `{ stdout, stderr }`. The caller writes each to the appropriate fd.
 * The combined stderr is all non-empty handler messages joined with newlines.
 */
export function formatDispatchResultForCC(
  hookEventName: string,
  dispatch: DispatchResult,
  perResultMessages?: string[],
): { stdout: string; stderr: string } {
  const stderr = (perResultMessages ?? dispatch.messages).join('\n')

  // ANV-0056: when the dispatcher produced an aggregated sessionStartContext,
  // emit it as the SOLE additionalContext — do not also emit per-handler inserts.
  if (dispatch.sessionStartContext !== undefined) {
    const safe = truncateUtf8Safe(
      dispatch.sessionStartContext,
      CC_HOOK_OUTPUT_MAX_BYTES,
    )
    const envelope = JSON.stringify({
      hookSpecificOutput: {
        hookEventName,
        additionalContext: safe,
      },
    })
    return { stdout: envelope, stderr }
  }

  // Non-session-start path: no aggregated context. Emit nothing on stdout
  // unless the caller provides a specific system-insert string.
  return { stdout: '', stderr }
}
