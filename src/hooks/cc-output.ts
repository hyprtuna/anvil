/**
 * Claude Code hook output formatting for the hook entrypoint (Plan 35 P1).
 *
 * This Layer-2 module duplicates the pure formatting logic from
 * src/adapters/claude-code/hook-output.ts so that entrypoint.ts (Layer 2)
 * does not need a cross-layer import from Layer 5 (adapters).
 *
 * The two implementations must stay in sync. If you change the envelope
 * shape here, update the adapter as well (and vice versa).
 *
 * Reference: https://code.claude.com/docs/en/hooks.md
 */

import type { HookResult } from '../core/types.js'

/** Hard cap for additionalContext: 10,240 bytes (10KB). */
export const CC_HOOK_OUTPUT_MAX_BYTES = 10_240

/** Truncation suffix appended when content exceeds the cap. */
export const TRUNCATION_SUFFIX = '\n…(truncated)'

/**
 * Truncate `text` so that the UTF-8 encoding fits within `maxBytes`.
 * Multi-byte codepoints are never split. The TRUNCATION_SUFFIX is appended.
 */
export function truncateUtf8Safe(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8')
  if (buf.byteLength <= maxBytes) return text

  let cpBoundary = maxBytes
  while (cpBoundary > 0 && (buf[cpBoundary]! & 0xc0) === 0x80) {
    cpBoundary--
  }

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
 *   stderr = message (if set).
 * - `message` only → stdout = plain text; stderr = ''.
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
