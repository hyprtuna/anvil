import type { HookHandler } from '../../core/types.js'

/**
 * Runs after a tool call completes. Logs tool name and result.
 * Disabled by default — opt in via config.hooks.enabled. Never blocks.
 */
export const postToolUseHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as { tool?: string; result?: string } | null
  const tool = payload?.tool ?? 'unknown'
  const result = payload?.result ?? ''
  return {
    exitCode: 0,
    message: `post-tool-use: ${tool}`,
    context: { tool, result },
  }
}
