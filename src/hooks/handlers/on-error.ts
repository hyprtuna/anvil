import type { HookHandler } from '../../core/types.js'

/**
 * Runs when an error occurs. Logs the error to context.
 * Never blocks.
 */
export const onErrorHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as { error?: string; stack?: string } | null
  const error = payload?.error ?? 'unknown error'
  return {
    exitCode: 0,
    message: `on-error: ${error}`,
    context: { error, stack: payload?.stack },
  }
}
