import type { HookHandler } from '../../core/types.js'

/**
 * Runs after a test suite completes. Logs pass/fail summary.
 * Disabled by default — opt in via config.hooks.enabled. Never blocks.
 */
export const postTestRunHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as {
    passed?: number
    failed?: number
    summary?: string
  } | null
  const passed = payload?.passed ?? 0
  const failed = payload?.failed ?? 0
  const summary = payload?.summary ?? `${passed} passed, ${failed} failed`
  return {
    exitCode: 0,
    message: `post-test-run: ${summary}`,
    context: { passed, failed, summary },
  }
}
