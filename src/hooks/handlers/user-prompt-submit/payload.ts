/**
 * Payload extraction for user-prompt-submit (Plan 43 Phase H).
 *
 * Two shapes are supported:
 *  - **String** (legacy / unit-test): payload is the prompt text directly.
 *  - **Object** (real Claude Code invocation): payload is the full stdin JSON
 *    object `{ prompt, session_id, cwd, hook_event_name, … }`.
 *
 * Returns undefined when the payload is neither shape or when `prompt` is
 * not a string.
 */

export function extractPrompt(payload: unknown): string | undefined {
  if (typeof payload === 'string') return payload
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'prompt' in payload &&
    typeof (payload as { prompt: unknown }).prompt === 'string'
  ) {
    return (payload as { prompt: string }).prompt
  }
  return undefined
}
