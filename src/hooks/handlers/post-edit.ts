import type { HookHandler } from '../../core/types.js'

/**
 * Runs after a file edit. Advisory only — always exits with code 0.
 * UI anti-pattern enforcement moved to skills/universal/ui/rules.md (Plan 39 Phase E).
 */
export const postEditHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as { file?: string; content?: string } | null
  const file = payload?.file ?? 'unknown'

  return {
    exitCode: 0,
    message: `post-edit: processed ${file}`,
    context: { file },
  }
}
