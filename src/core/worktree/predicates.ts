/**
 * ANV-0155 — Pure predicates for worktree safety guards.
 * Layer 0 — no I/O; all data is injected as arguments.
 *
 * Hard rules enforced here:
 *   - isProtectedPath: returns true for .claude/worktrees/* paths (NEVER touch those)
 *   - Only .worktrees/* paths are eligible for cleanup
 */

import type { WorktreeEntry } from './types.js'

/**
 * Returns true for paths that must NEVER be touched by cleanup.
 *
 * Allowlist: `.worktrees/*` only.
 * Protected: `.claude/worktrees/*` (session-managed by Claude Code infrastructure).
 *
 * The path is the worktree path as returned by `git worktree list --porcelain`,
 * relative to the repo root OR absolute. We check both the basename segment
 * and a suffix match.
 */
export function isProtectedPath(path: string): boolean {
  // Normalise: strip trailing slash
  const p = path.replace(/\/+$/, '')

  // Protected: anything under .claude/worktrees/ (absolute or relative)
  if (
    p.includes('/.claude/worktrees/') ||
    p.includes('\\.claude\\worktrees\\') ||
    p.endsWith('/.claude/worktrees') ||
    p.endsWith('\\.claude\\worktrees')
  ) {
    return true
  }

  // Any .claude path segment is protected
  const parts = p.split(/[/\\]/)
  if (parts.includes('.claude')) return true

  return false
}

/**
 * Returns true when the worktree path is inside `.worktrees/` (the allowed
 * cleanup target). Paths not matching this pattern are silently skipped.
 */
export function isAnvilWorktreePath(path: string): boolean {
  return (
    path.includes('/.worktrees/') ||
    path.includes('\\.worktrees\\') ||
    path.endsWith('/.worktrees') ||
    path.endsWith('\\.worktrees')
  )
}

/**
 * Returns true when the branch has been merged into `targetBranch`.
 *
 * @param branchName   - the feature branch to check
 * @param mergedBranches - set/array of branch names already merged (from
 *                         `git branch --merged <targetBranch>`)
 */
export function isMergedBranch(
  branchName: string,
  mergedBranches: readonly string[],
): boolean {
  return mergedBranches.some((b) => b.trim() === branchName.trim())
}

/**
 * Returns true when the local branch has commits that have NOT been pushed
 * to `origin/<branch>`.
 *
 * @param localSha  - SHA of the local branch tip (from `git rev-parse <branch>`)
 * @param remoteSha - SHA of origin/<branch> tip (from `git rev-parse origin/<branch>`)
 *                    Pass null/undefined/empty when the remote branch doesn't exist.
 */
export function hasUnpushedCommits(
  localSha: string,
  remoteSha: string | null | undefined,
): boolean {
  if (!remoteSha) return true // no remote tracking → treat as unpushed
  return localSha.trim() !== remoteSha.trim()
}

/**
 * Returns true when the worktree has uncommitted changes.
 *
 * @param statusOutput - output of `git status --porcelain` for the worktree
 */
export function isDirtyTree(statusOutput: string): boolean {
  return statusOutput.trim().length > 0
}

/**
 * Classify a worktree entry for cleanup.
 *
 * Returns the action to take and a human-readable reason.
 */
export function classifyWorktreeEntry(
  entry: WorktreeEntry,
  opts: {
    primaryPath: string
    isDirty: boolean
    isMerged: boolean
    hasUnpushed: boolean
    force: boolean
    all: boolean
  },
): {
  action:
    | 'remove'
    | 'skip-dirty'
    | 'skip-unmerged'
    | 'skip-unpushed'
    | 'skip-primary'
    | 'skip-protected'
  reason: string
} {
  if (entry.path === opts.primaryPath) {
    return {
      action: 'skip-primary',
      reason: 'primary worktree — never touched',
    }
  }

  if (isProtectedPath(entry.path)) {
    return {
      action: 'skip-protected',
      reason: 'protected path (.claude/worktrees) — never touched',
    }
  }

  if (!isAnvilWorktreePath(entry.path)) {
    return {
      action: 'skip-protected',
      reason: 'not under .worktrees/ — skipped',
    }
  }

  if (opts.isDirty) {
    return { action: 'skip-dirty', reason: 'worktree has uncommitted changes' }
  }

  if (opts.hasUnpushed && !opts.force) {
    return {
      action: 'skip-unpushed',
      reason: 'branch has unpushed commits — use --force to override',
    }
  }

  if (!opts.isMerged && !opts.all) {
    return {
      action: 'skip-unmerged',
      reason: 'branch not merged — use --all to remove regardless',
    }
  }

  return { action: 'remove', reason: 'merged and clean' }
}
