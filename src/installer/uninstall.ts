import { existsSync, readdirSync, rmdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { unmergeStatusLine } from '../commands/cli/statusline-install.js'
import type { Scope } from '../core/types.js'
import { archiveAnvilHome } from './archive-anvil-home.js'
import { removeOpenCodeStandingInstructions } from './install.js'

export interface UninstallOptions {
  scope: Scope
  cwd?: string
  home?: string
  /**
   * Plan 32 F4: when true, also remove the Anvil routing block from AGENTS.md.
   * Default false — preserves the file unless the user explicitly opts in.
   */
  removeRules?: boolean
  /**
   * v0.10.9 S-012: when true, archive `~/.anvil/` (excluding `cache/`) to
   * `~/.anvil-backups/<ts>.tgz` before destructive removal. Retains the last
   * 5 archives. Combine with `dryRun: true` (via runUninstallPlan) for a
   * preview-only path.
   */
  archive?: boolean
  /**
   * v0.10.9 S-012: when true with `archive`, do not actually create or prune
   * archives — only report what would happen.
   */
  dryRun?: boolean
}

export interface UninstallSummary {
  removed: string[]
  /** v0.10.9 S-012: populated when `opts.archive === true`. */
  archivePath?: string
  /** v0.10.9 S-012: archives pruned by the retention policy. */
  prunedArchives?: string[]
}

// ---------------------------------------------------------------------------
// UninstallTarget — a single named path entry
// ---------------------------------------------------------------------------

export interface UninstallTarget {
  /** Human-readable identifier, e.g. "cc-user", "oc-project". */
  id: string
  /** Whether the path currently exists on disk. */
  present: boolean
  /** Absolute paths that will be removed (currently always a single path). */
  paths: string[]
}

// ---------------------------------------------------------------------------
// UninstallPlan — pure data, no side effects
// ---------------------------------------------------------------------------

export interface UninstallPlan {
  scope: Scope
  willRemove: string[]
  targets: UninstallTarget[]
  /** Directories to attempt rmdir on (swallowing ENOTEMPTY) after the file sweep. */
  cleanupDirs: string[]
}

/**
 * Minimal glob-pattern matcher for basename matching only.
 * Supports `*` as wildcard; no path separators or `?` needed for S-006.
 */
function matchesGlobPattern(filename: string, pattern: string): boolean {
  // Convert the simple glob pattern to a regex.
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(filename)
}

/**
 * Compute what `runUninstall` would remove without executing anything.
 * Pure — no writes, no deletes.
 */
export function runUninstallPlan(opts: UninstallOptions): UninstallPlan {
  const root =
    opts.scope === 'global'
      ? (opts.home ?? process.env.HOME ?? '/tmp')
      : (opts.cwd ?? process.cwd())

  // Global scope: ~/.anvil/ holds BOTH install artifacts (agents, bin, hooks…)
  // and user data (projects/, sessions/, preferences.json, logs/). Only the
  // install artifacts get removed; user data survives so that re-installing
  // returns to the same per-project state and preferences.
  //
  // Project scope: {cwd}/.anvil/ is fully install-owned (per-project runtime
  // state moved to ~/.anvil/projects/ in a prior change), so the whole dir
  // can be removed as a single target.
  const anvilHomeTargets =
    opts.scope === 'global'
      ? [
          { id: 'anvil-home-agents', path: join(root, '.anvil', 'agents') },
          { id: 'anvil-home-bin', path: join(root, '.anvil', 'bin') },
          // Transient build/staging cache — archive explicitly excludes it,
          // so semantically it's install-managed, not user data.
          { id: 'anvil-home-cache', path: join(root, '.anvil', 'cache') },
          {
            id: 'anvil-home-claude-plugin',
            path: join(root, '.anvil', '.claude-plugin'),
          },
          { id: 'anvil-home-commands', path: join(root, '.anvil', 'commands') },
          { id: 'anvil-home-hooks', path: join(root, '.anvil', 'hooks') },
          { id: 'anvil-home-plugins', path: join(root, '.anvil', 'plugins') },
          { id: 'anvil-home-runtime', path: join(root, '.anvil', 'runtime') },
          { id: 'anvil-home-skills', path: join(root, '.anvil', 'skills') },
          {
            id: 'anvil-home-templates',
            path: join(root, '.anvil', 'templates'),
          },
          {
            id: 'anvil-home-models',
            path: join(root, '.anvil', 'models.json'),
          },
          { id: 'anvil-home-version', path: join(root, '.anvil', 'version') },
        ]
      : [{ id: 'anvil-home', path: join(root, '.anvil') }]

  const targetDefs: Array<{ id: string; path: string; globPattern?: string }> =
    [
      ...anvilHomeTargets,
      { id: 'cc-plugin', path: join(root, '.claude-plugin') },
      { id: 'cc-skills', path: join(root, '.claude', 'skills', 'anvil') },
      { id: 'cc-models', path: join(root, '.claude', 'models.json') },
      // S-006: only remove anvil-*.md sentinel files; leave user commands intact.
      {
        id: 'cc-commands',
        path: join(root, '.claude', 'commands'),
        globPattern: 'anvil-*.md',
      },
      { id: 'cc-hooks', path: join(root, '.claude', 'hooks') },
      { id: 'cc-agents', path: join(root, '.claude', 'agents') },
      // Legacy v1 OpenCode path
      { id: 'oc-legacy', path: join(root, '.opencode') },
      // v2 OpenCode plugin path
      { id: 'oc-plugin', path: join(root, 'plugins', 'opencode') },
    ]

  const targets: UninstallTarget[] = targetDefs.map((def) => {
    if (def.globPattern) {
      // Glob-scoped target: only list files matching the pattern in the dir.
      const dirExists = existsSync(def.path)
      if (!dirExists) {
        return { id: def.id, present: false, paths: [] }
      }
      const pattern = def.globPattern
      const matched = readdirSync(def.path).filter((f) =>
        matchesGlobPattern(f, pattern),
      )
      const paths = matched.map((f) => join(def.path, f))
      return { id: def.id, present: paths.length > 0, paths }
    }
    return {
      id: def.id,
      present: existsSync(def.path),
      paths: [def.path],
    }
  })

  const willRemove = targets.filter((t) => t.present).flatMap((t) => t.paths)

  // Directories to rmdir after the file sweep.
  // - Glob-scoped targets (e.g. cc-commands).
  // - Global scope: ~/.anvil/ itself, so an empty anvil-home with no surviving
  //   user data still gets cleaned up. rmdir swallows ENOTEMPTY when
  //   projects/, sessions/, preferences.json, or logs/ remain.
  const cleanupDirs = [
    ...targetDefs
      .filter((def) => def.globPattern && existsSync(def.path))
      .map((def) => def.path),
    ...(opts.scope === 'global' && existsSync(join(root, '.anvil'))
      ? [join(root, '.anvil')]
      : []),
  ]

  return { scope: opts.scope, willRemove, targets, cleanupDirs }
}

// ---------------------------------------------------------------------------
// runUninstall — executes the plan
// ---------------------------------------------------------------------------

export async function runUninstall(
  opts: UninstallOptions,
): Promise<UninstallSummary> {
  const plan = runUninstallPlan(opts)
  const cwd = opts.cwd ?? process.cwd()
  const home = opts.home ?? process.env.HOME ?? '/tmp'

  const removed: string[] = []

  // v0.10.9 S-012: archive ~/.anvil/ (minus cache/) before destructive rm.
  let archivePath: string | undefined
  let prunedArchives: string[] | undefined
  if (opts.archive) {
    const anvilHome =
      opts.scope === 'global' ? join(home, '.anvil') : join(cwd, '.anvil')
    const backupsDir = join(home, '.anvil-backups')
    const result = await archiveAnvilHome({
      anvilHome,
      backupsDir,
      dryRun: opts.dryRun === true,
    })
    archivePath = result.archivePath
    prunedArchives = result.pruned
    if (result.created) {
      removed.push(`archived ${anvilHome} → ${result.archivePath}`)
    } else if (opts.dryRun) {
      removed.push(`would archive ${anvilHome} → ${result.archivePath}`)
    }
    for (const p of result.pruned) {
      removed.push(`pruned old archive ${p}`)
    }
  }

  if (!opts.dryRun) {
    // v0.10.9 S-001: unmerge statusLine / subagentStatusLine before removing
    // .claude tree (so "kept (custom)" reports are accurate). Only surface
    // mutating actions — "skipped" / "kept (custom)" stay quiet so a no-op
    // uninstall on a clean dir continues to report an empty removed list.
    const slResult = await unmergeStatusLine({
      scope: opts.scope === 'global' ? 'global' : 'project',
      cwd: opts.scope === 'global' ? home : cwd,
    })
    for (const action of slResult.actions) {
      if (action.startsWith('removed ')) {
        removed.push(`settings: ${action}`)
      }
    }

    for (const path of plan.willRemove) {
      await rm(path, { recursive: true, force: true })
      removed.push(path)
    }

    // S-006: after removing anvil-*.md sentinel files, clean up the commands
    // directory if it is now empty. Swallow ENOTEMPTY (user files remain).
    for (const dir of plan.cleanupDirs) {
      try {
        rmdirSync(dir)
        removed.push(`${dir} (empty dir removed)`)
      } catch (err) {
        if (
          (err as NodeJS.ErrnoException).code !== 'ENOTEMPTY' &&
          (err as NodeJS.ErrnoException).code !== 'ENOENT'
        ) {
          throw err
        }
        // ENOTEMPTY: user files remain — leave the dir. ENOENT: already gone.
      }
    }

    // Plan 32 F4: remove the Anvil routing block from AGENTS.md on opt-in.
    if (opts.removeRules) {
      const didRemove = await removeOpenCodeStandingInstructions(cwd)
      if (didRemove) {
        removed.push(join(cwd, 'AGENTS.md (routing block removed)'))
      }
    }
  }

  return { removed, archivePath, prunedArchives }
}
