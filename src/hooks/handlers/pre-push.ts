import { execSync } from 'node:child_process'
import type { HookHandler } from '../../core/types.js'
import { HookExit } from '../exit-codes.js'

/**
 * Runs before git push. Runs the full test suite if available.
 * BLOCK on failure.
 */
export const prePushHandler: HookHandler = async (ctx) => {
  try {
    execSync('npm test', { cwd: ctx.cwd, stdio: 'pipe' })
    return { exitCode: HookExit.SUCCESS, message: 'pre-push: all tests pass' }
  } catch {
    return {
      exitCode: HookExit.BLOCK,
      message: 'pre-push: tests failed — push aborted',
    }
  }
}
