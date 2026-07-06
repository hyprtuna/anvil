import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { NotepadsSection } from './types.js'

/**
 * Sanitize a git branch name into a filesystem-safe slug.
 *
 * Rules (aligned with design spec §3):
 * - Strip `refs/heads/` prefix.
 * - Lowercase.
 * - Replace any character that is not `[a-z0-9-]` with `-`.
 * - Collapse consecutive dashes to a single dash.
 * - Strip leading and trailing dashes.
 * - Truncate to 40 chars (append `-dot` to signal truncation).
 * - Handle detached HEAD (`HEAD` / empty) by reading the short commit hash.
 * - Fall back to `main` if all transformations yield empty.
 */
export function deriveBranchSlug(branch: string, cwd?: string): string {
  if (branch === 'HEAD') {
    // Strip inherited GIT_* env vars so cwd-based discovery wins (e.g. when
    // called from inside a git hook where GIT_DIR points at the parent repo).
    const env = { ...process.env }
    for (const key of Object.keys(env)) {
      if (key.startsWith('GIT_')) delete env[key]
    }
    try {
      const commit = execSync('git rev-parse --short HEAD', {
        cwd,
        env,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      return `detached-${commit}`
    } catch {
      return 'detached-unknown'
    }
  }
  if (!branch) return 'main'
  let slug = branch
    .toLowerCase()
    .replace(/^refs\/heads\//, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (slug.length > 40) slug = `${slug.slice(0, 36)}-dot`
  return slug || 'main'
}

/**
 * Returns the notepads root directory for a repo.
 * e.g. `/path/to/repo/.anvil/notepads/`
 */
export function getNotepadsDir(repoRoot: string): string {
  return join(repoRoot, '.anvil', 'notepads')
}

/**
 * Returns the path to the auto-loaded `recent-context.md` for a branch.
 */
export function getRecentContextPath(repoRoot: string, branch: string): string {
  const slug = deriveBranchSlug(branch)
  return join(getNotepadsDir(repoRoot), slug, 'recent-context.md')
}

/**
 * Returns the path to a specific section file for a branch.
 */
export function getSectionPath(
  repoRoot: string,
  branch: string,
  section: NotepadsSection,
): string {
  const slug = deriveBranchSlug(branch)
  return join(getNotepadsDir(repoRoot), slug, `${section}.md`)
}

/**
 * Returns the archive directory for a branch slug.
 */
export function getArchivePath(repoRoot: string, branchOrSlug: string): string {
  return join(repoRoot, '.anvil', 'archive', branchOrSlug)
}
