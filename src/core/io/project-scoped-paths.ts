/**
 * Project-scoped sidecar path helpers (ANV-NNNN).
 *
 * The four runtime-state files previously lived at `{cwd}/.anvil/<name>.json`,
 * which polluted the project tree, could not survive `git clean`, and conflicted
 * across git worktrees of the same repo.
 *
 * This module keys per-project state by `deriveProjectName(cwd)` and stores
 * files under `~/.anvil/projects/<name>/<name>.json`.
 *
 * Design principles:
 *  - Worktree-safe: two worktrees of the same repo share the git-remote-derived
 *    name; the collision branch appends a 6-char hash of the absolute cwd.
 *  - Silent auto-migrate on first ensureProjectDir: legacy `.anvil/<name>.json`
 *    is renamed to the new location when the new path does not yet exist.
 *  - No sweep: project state is long-lived; cleanup is a future command.
 *
 * Layer-0: this file imports nothing from higher layers.
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { deriveProjectName } from '../preferences.js'

// ─── Canonical file names ─────────────────────────────────────────────────────

/** The four canonical per-project runtime-state file names. */
export type ProjectStateName =
  | 'active-routing'
  | 'active-skill'
  | 'project'
  | 'registry'

/** All four canonical names, used for migration iteration. */
const ALL_PROJECT_STATE_NAMES: ProjectStateName[] = [
  'active-routing',
  'active-skill',
  'project',
  'registry',
]

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Root directory for all per-project state: `~/.anvil/projects`.
 * Honors `ANVIL_HOME` env var when set (mirrors `findSkillScope` in active-state.ts).
 */
export function projectsRoot(): string {
  const home = homedir()
  const anvilHome =
    process.env.ANVIL_HOME ?? join(process.env.HOME ?? home, '.anvil')
  return join(anvilHome, 'projects')
}

/**
 * Directory for a specific project: `<projectsRoot()>/<deriveProjectName(cwd)>`.
 * Async because deriveProjectName is async.
 */
export async function projectDir(cwd: string): Promise<string> {
  const name = await deriveProjectName(cwd)
  return join(projectsRoot(), name)
}

/**
 * Full path to a named sidecar file for a project.
 *
 * Example:
 *   getProjectScopedPath('/home/user/workspace/anvil', 'registry')
 *   → '/home/user/.anvil/projects/github.com_example_anvil/registry.json'
 */
export async function getProjectScopedPath(
  cwd: string,
  name: ProjectStateName,
): Promise<string> {
  return join(await projectDir(cwd), `${name}.json`)
}

// ─── Ensure + migrate ─────────────────────────────────────────────────────────

/**
 * Ensure the project state directory exists and run silent migration.
 *
 * Migration policy (per file):
 *  - If `{cwd}/.anvil/<name>.json` exists AND the new path does not → rename.
 *  - If both exist → leave both; new path is authoritative, no clobber.
 *  - If neither → no-op.
 *
 * All renames are wrapped in try/catch — best-effort, consistent with the
 * rest of the runtime-state code. Uses sync fs to keep the overhead cheap
 * on every ensure call.
 *
 * Returns the project directory path.
 */
export async function ensureProjectDir(cwd: string): Promise<string> {
  const dir = await projectDir(cwd)
  mkdirSync(dir, { recursive: true })

  for (const name of ALL_PROJECT_STATE_NAMES) {
    const legacyPath = join(cwd, '.anvil', `${name}.json`)
    const newPath = join(dir, `${name}.json`)
    try {
      if (existsSync(legacyPath) && !existsSync(newPath)) {
        renameSync(legacyPath, newPath)
      }
    } catch {
      // Best-effort: silently skip any rename failure.
    }
  }

  return dir
}
