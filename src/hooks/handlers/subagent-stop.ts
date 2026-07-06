import type { HookHandler } from '../../core/types.js'

/**
 * SubagentStop handler. Claude Code's SubagentStop event fires when a
 * dispatched subagent finishes; this handler is a no-op pass-through.
 * Subagent invocation tracing lives in `src/agents/runner.ts`.
 *
 * Returns 0 unconditionally; never blocks.
 */
export const subagentStopHandler: HookHandler = async () => ({
  exitCode: 0,
})
