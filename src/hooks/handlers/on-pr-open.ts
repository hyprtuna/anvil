import type { HookHandler } from '../../core/types.js'

/**
 * Runs when a PR is opened. Provides context for automated code review.
 * Never blocks.
 */
export const onPrOpenHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as { prNumber?: number; branch?: string } | null
  const pr = payload?.prNumber ?? 'unknown'
  const branch = payload?.branch ?? 'unknown'
  return {
    exitCode: 0,
    message: `on-pr-open: PR #${pr} on ${branch}`,
    context: { prNumber: pr, branch },
  }
}
