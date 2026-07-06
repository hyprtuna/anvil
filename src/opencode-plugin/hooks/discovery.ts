/**
 * Hook file discovery for the OC plugin dispatcher.
 *
 * Resolves compiled hook scripts (.cjs) from two locations in priority order:
 *   1. ~/.anvil/hooks/<kind>/*.cjs  (global, installed by `anvil init --scope global`)
 *   2. <cwd>/.anvil/hooks/<kind>/*.cjs  (project-scoped)
 *
 * Project-scoped hooks override global by basename (D-02).
 * Discovery is cached per (process, cwd) keyed by directory mtimes.
 * Symlinks are not followed out of hook directories (lstat, not stat).
 */

import { lstat, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { HookKind } from '../../core/types.js'
import { pluginCleanup } from '../cleanup-registry.js'

/**
 * Test-only: override the global Anvil hooks root.
 * Set ANVIL_GLOBAL_HOOKS_OVERRIDE to a directory path in tests.
 * In production, global hooks live at ~/.anvil/hooks/.
 */
function getGlobalHooksRoot(): string {
  if (process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE)
    return process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE
  return join(homedir(), '.anvil', 'hooks')
}

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry {
  /** mtime of the global hook kind directory (ms), or -1 if absent */
  globalMtime: number
  /** mtime of the project hook kind directory (ms), or -1 if absent */
  projectMtime: number
  /** Resolved absolute paths in dispatch order */
  files: readonly string[]
}

/** Cache key: `${cwd}:${kind}` */
const cache = new Map<string, CacheEntry>()

// ANV-0097: register the discovery cache against the plugin-wide cleanup
// registry so plugin shutdown / reload drains it. Side-effectful module-
// level registration is intentional — the cache is process-scoped state
// created at module load and must be torn down with the plugin.
pluginCleanup.register(() => {
  cache.clear()
})

async function getMtime(dir: string): Promise<number> {
  try {
    const s = await lstat(dir)
    // Only directories are valid hook kind dirs; reject symlinks to dirs
    if (!s.isDirectory()) return -1
    return s.mtimeMs
  } catch {
    return -1
  }
}

async function listCjsFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      if (!entry.name.endsWith('.cjs')) continue
      // Symlink safety: use lstat on the resolved path; skip if not regular file
      const fullPath = join(dir, entry.name)
      try {
        const s = await lstat(fullPath)
        if (!s.isFile()) continue
      } catch {
        continue
      }
      files.push(fullPath)
    }
    // Stable order within each directory
    files.sort()
    return files
  } catch {
    return []
  }
}

/**
 * Resolve the absolute paths of all `.cjs` hook scripts for `kind` in `cwd`.
 *
 * Returns files in dispatch order:
 *   - Global hooks first (alphabetical by basename)
 *   - Project hooks second (alphabetical by basename)
 *   - Project hook with same basename as global hook replaces the global one
 *
 * Missing directories are silently treated as empty. No throws.
 */
export async function resolveHookFiles(
  kind: HookKind,
  cwd: string,
): Promise<string[]> {
  const globalDir = join(getGlobalHooksRoot(), kind)
  const projectDir = join(cwd, '.anvil', 'hooks', kind)
  const cacheKey = `${cwd}:${kind}`

  const [globalMtime, projectMtime] = await Promise.all([
    getMtime(globalDir),
    getMtime(projectDir),
  ])

  const existing = cache.get(cacheKey)
  if (
    existing !== undefined &&
    existing.globalMtime === globalMtime &&
    existing.projectMtime === projectMtime
  ) {
    return [...existing.files]
  }

  const [globalFiles, projectFiles] = await Promise.all([
    listCjsFiles(globalDir),
    listCjsFiles(projectDir),
  ])

  // Build merged list: project overrides global by basename
  const projectBasenames = new Set(projectFiles.map((f) => basename(f)))
  const merged: string[] = [
    ...globalFiles.filter((f) => !projectBasenames.has(basename(f))),
    ...projectFiles,
  ]

  cache.set(cacheKey, { globalMtime, projectMtime, files: merged })
  return merged
}

/** Clears the discovery cache. Exposed for tests. */
export function clearDiscoveryCache(): void {
  cache.clear()
}
