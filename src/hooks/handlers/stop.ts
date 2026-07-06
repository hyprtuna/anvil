import { spawnSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { getProjectScopedPath } from '../../core/io/project-scoped-paths.js'
import { getSessionScopedPath } from '../../core/io/session-scoped-paths.js'
import { findProjectRoot } from '../../core/project/root.js'
import type { HookHandler, HookResult } from '../../core/types.js'
import { clearAccumState, loadAccumState } from './post-edit-accumulator.js'

/**
 * Stop handler. Claude Code's Stop event fires when the main loop
 * terminates.
 *
 * Plan 28 C7: clear `.anvil/active-skill.json` so the statusline does not
 * keep advertising a stale routed skill after the turn has ended.
 *
 * Plan 39 Phase H: read the edit-accumulator state file and run a batched
 * format + typecheck pass over all edited files accumulated during the
 * session. This defers per-edit lint overhead to a single Stop-time
 * invocation.
 *
 * Returns 0 unconditionally; never blocks. Partial lint failure is logged
 * but does not prevent the active-skill clear.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const SPAWN_TIMEOUT_MS = 30_000

// File extensions eligible for format (biome handles TS/JS/JSON etc.)
const FORMAT_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])

// File extensions that require tsc typecheck
const TSC_EXTS = new Set(['.ts', '.tsx'])

// ─── Injectable spawn (replaceable in tests) ──────────────────────────────────

/**
 * Module-level spawn function reference. Tests can replace this with a spy
 * by assigning to `spawnFn` exported below.
 */
export let spawnFn: typeof spawnSync = spawnSync

/** Override the spawn function (for tests). Restored via resetSpawnFn(). */
export function setSpawnFn(fn: typeof spawnSync): void {
  spawnFn = fn
}

/** Restore the spawn function to the real spawnSync. */
export function resetSpawnFn(): void {
  spawnFn = spawnSync
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sessionIdFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  return typeof p.session_id === 'string' ? p.session_id : null
}

function transcriptPathFromPayload(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  return typeof p.transcript_path === 'string' ? p.transcript_path : null
}

function filterByExts(paths: string[], exts: Set<string>): string[] {
  return paths.filter((p) => {
    const dot = p.lastIndexOf('.')
    if (dot === -1) return false
    return exts.has(p.slice(dot))
  })
}

/**
 * Run a format pass with biome over the given files.
 * Returns true on success, false on spawn error or non-zero exit.
 */
export function runBatchFormat(files: string[], cwd: string): boolean {
  if (files.length === 0) return true
  const result = spawnFn('npx', ['biome', 'check', '--write', ...files], {
    cwd,
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
    shell: false,
  })
  if (result.error) {
    process.stderr.write(
      `[stop-batch] biome spawn error: ${String(result.error)}\n`,
    )
    return false
  }
  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(
        `[stop-batch] biome stderr:\n${String(result.stderr)}\n`,
      )
    }
    if (result.stdout) {
      process.stderr.write(
        `[stop-batch] biome stdout:\n${String(result.stdout)}\n`,
      )
    }
    return false
  }
  return true
}

/**
 * Run tsc --noEmit in the given cwd.
 * Returns true on success, false on spawn error or non-zero exit.
 */
export function runTypeCheck(cwd: string): boolean {
  const result = spawnFn('npx', ['tsc', '--noEmit'], {
    cwd,
    encoding: 'utf-8',
    timeout: SPAWN_TIMEOUT_MS,
    shell: false,
  })
  if (result.error) {
    process.stderr.write(
      `[stop-batch] tsc spawn error: ${String(result.error)}\n`,
    )
    return false
  }
  if (result.status !== 0) {
    if (result.stderr) {
      process.stderr.write(
        `[stop-batch] tsc stderr:\n${String(result.stderr)}\n`,
      )
    }
    if (result.stdout) {
      process.stderr.write(
        `[stop-batch] tsc stdout:\n${String(result.stdout)}\n`,
      )
    }
    return false
  }
  return true
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const stopHandler: HookHandler = async (ctx) => {
  // ── 1. Clear the active-skill marker (Plan 28 C7 / ANV-0043) ───────────────
  // Clear session-scoped path if transcript_path is present; also clear legacy
  // project-relative path for backward-compat.
  const transcriptPath = transcriptPathFromPayload(ctx.payload)
  if (transcriptPath) {
    try {
      await fs.unlink(getSessionScopedPath(transcriptPath, 'active-skill'))
    } catch {
      // already absent — fine.
    }
    try {
      await fs.unlink(getSessionScopedPath(transcriptPath, 'active-routing'))
    } catch {
      // already absent — fine.
    }
  }
  // Per-project path: clear the project-scoped active-skill.
  // ANV-0139: resolve the canonical project root so worktree-cwd invocations
  // find the correct per-project directory rather than missing it.
  const legacyRoot = (await findProjectRoot(ctx.cwd)) ?? ctx.cwd
  try {
    const projectSkillPath = await getProjectScopedPath(
      legacyRoot,
      'active-skill',
    )
    await fs.unlink(projectSkillPath)
  } catch {
    // already absent — fine.
  }

  // ── 2. Batch format + typecheck (Plan 39 Phase H) ──────────────────────────
  const sessionId = sessionIdFromPayload(ctx.payload)
  if (!sessionId) return { exitCode: 0 } as HookResult

  let accumPaths: Set<string>
  try {
    accumPaths = await loadAccumState(sessionId)
  } catch {
    // best-effort: if we can't read, skip the batch step
    return { exitCode: 0 } as HookResult
  }

  if (accumPaths.size === 0) {
    // Nothing accumulated this session — skip lint pass
    return { exitCode: 0 } as HookResult
  }

  const allPaths = Array.from(accumPaths)
  const formatFiles = filterByExts(allPaths, FORMAT_EXTS)
  const tsFiles = filterByExts(allPaths, TSC_EXTS)

  let formatOk = true
  let tscOk = true

  // Run format (biome) over TS/JS files
  if (formatFiles.length > 0) {
    formatOk = runBatchFormat(formatFiles, ctx.cwd)
  }

  // Run tsc --noEmit if any TS files were edited
  if (tsFiles.length > 0) {
    tscOk = runTypeCheck(ctx.cwd)
  }

  // Clear accumulator on success (both steps passed)
  if (formatOk && tscOk) {
    try {
      await clearAccumState(sessionId)
    } catch {
      // best-effort
    }
  } else {
    // Partial failure — log summary but don't block
    process.stderr.write(
      `[stop-batch] batch lint completed with errors (format=${formatOk ? 'ok' : 'fail'}, tsc=${tscOk ? 'ok' : 'fail'}). Accumulator retained for next run.\n`,
    )
  }

  return { exitCode: 0 } as HookResult
}
