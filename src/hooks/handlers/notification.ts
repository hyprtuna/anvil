import type { HookHandler } from '../../core/types.js'

/**
 * Notification handler. Claude Code dispatches Notification events for
 * user-facing signals; this handler is a no-op pass-through that keeps
 * the kind registered without blocking the dispatcher.
 *
 * Returns 0 unconditionally; never blocks.
 */
export const notificationHandler: HookHandler = async () => ({
  exitCode: 0,
})
