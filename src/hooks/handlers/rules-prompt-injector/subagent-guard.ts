/**
 * Subagent-context detection for rules-prompt-injector (Plan 43 Phase F).
 *
 * Default-deny: only positive on explicit signal. Two independent channels:
 *   1. `payload.session_type === 'subagent'` — Claude Code envelope field set
 *      when the hook fires inside a Task subagent.
 *   2. `env.ANVIL_AGENT_MODE === 'subagent'` — opt-in env var that agent
 *      launchers can set to mark subagent sessions explicitly.
 */

export interface UserPromptPayload {
  prompt?: string
  intent?: string
  /** CC hook payload field: 'subagent' when the hook fires inside a Task subagent. */
  session_type?: string
}

export function isSubagentContext(
  payload: unknown,
  env: Record<string, string>,
): boolean {
  if (env.ANVIL_AGENT_MODE === 'subagent') return true
  if (
    typeof payload === 'object' &&
    payload !== null &&
    (payload as UserPromptPayload).session_type === 'subagent'
  ) {
    return true
  }
  return false
}

/** Stderr trace marker for hook logs when the guard fires. */
export function emitSubagentStop(reason: string): void {
  process.stderr.write(
    `[anvil:rules-prompt-injector] <SUBAGENT-STOP> reason: ${reason}\n`,
  )
}

/** Resolve the reason string from env+payload signals. */
export function subagentReason(
  _payload: unknown,
  env: Record<string, string>,
): string {
  return env.ANVIL_AGENT_MODE === 'subagent'
    ? 'env.ANVIL_AGENT_MODE=subagent'
    : 'payload.session_type=subagent'
}
