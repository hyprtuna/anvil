/**
 * Post-edit accumulator (Plan 39 Phase H — refactored Plan 43 Phase H).
 *
 * PostToolUse handler that matches Edit|Write|MultiEdit. Accumulates edited
 * file paths in a session-scoped state file at
 * `~/.anvil/state/edit-accumulator-<sessionId>.json` so the stop handler can
 * run a single batched format + typecheck pass instead of re-linting on every
 * individual edit.
 *
 * Helpers live under `./post-edit-accumulator/`:
 *   state.ts   — load/persist/clear, EditAccumulatorState, per-process cache
 *   payload.ts — getSessionId, extractEditedPaths
 *
 * Invariants:
 *  - Idempotent: no duplicate paths in state (Set semantics).
 *  - 24h TTL: stale files are deleted and recreated.
 *  - Best-effort: any FS error is logged to stderr; handler always returns
 *    exitCode 0.
 */

import type { HookHandler, HookResult } from '../../core/types.js'
import {
  extractEditedPaths,
  getSessionId,
} from './post-edit-accumulator/payload.js'
import {
  loadAccumState,
  persistAccumState,
} from './post-edit-accumulator/state.js'

// Re-export public surface so existing callers keep importing from this shell.
export {
  type EditAccumulatorState,
  accumStateDir,
  accumStateFilePath,
  clearAccumState,
  loadAccumState,
  persistAccumState,
  resetAccumCache,
} from './post-edit-accumulator/state.js'

export { extractEditedPaths } from './post-edit-accumulator/payload.js'

const NOOP: HookResult = { exitCode: 0 }

/**
 * PostToolUse handler. No-ops for non-edit tool names. Always exits 0.
 */
export const postEditAccumulatorHandler: HookHandler = async (ctx) => {
  try {
    const sessionId = getSessionId(ctx.payload)
    if (!sessionId) return NOOP

    const editedPaths = extractEditedPaths(ctx.payload)
    if (editedPaths.length === 0) return NOOP

    const paths = await loadAccumState(sessionId)
    let changed = false
    for (const p of editedPaths) {
      if (!paths.has(p)) {
        paths.add(p)
        changed = true
      }
    }
    if (changed) {
      await persistAccumState(sessionId, paths)
    }
  } catch (err) {
    process.stderr.write(
      `[post-edit-accumulator] unexpected error: ${String(err)}\n`,
    )
  }
  return NOOP
}
