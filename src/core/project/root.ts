import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse, resolve as resolvePath } from 'node:path'

/**
 * ANV-0139 — worktree-aware project-root resolution.
 *
 * Anvil's `.anvil/` index lives only in the canonical repo root. Linked git
 * worktrees never contain `.anvil/`, so an upward walk from `cwd` alone misses
 * the index whenever a hook fires inside a linked worktree (which happens any
 * time a sub-agent runs with `isolation: worktree`).
 *
 * `resolveProjectRoot` solves this with a two-step strategy:
 *
 *   1. Walk upward from `cwd` looking for the first ancestor that contains
 *      either `.anvil/` or `.git` — whichever boundary we hit first.
 *
 *      - If `.anvil/` is found first, return it (fast path).
 *      - If `.git` is found first, that directory is the current repo's
 *        working-tree root. Stop walking — we never cross a repo boundary
 *        looking for `.anvil/`, since a parent-of-repo `.anvil/` would belong
 *        to a different project entirely.
 *
 *   2. If we stopped at a `.git` boundary without finding `.anvil/`, ask git
 *      for the canonical `.git` directory via:
 *
 *          git rev-parse --path-format=absolute --git-common-dir
 *
 *      In a linked worktree the result is `<canonical-repo>/.git`; strip the
 *      trailing `/.git` and walk upward from there to find the canonical
 *      project's `.anvil/`.
 *
 *   3. Otherwise (no `.anvil/`, no `.git`, no git answer) throw
 *      `ProjectRootNotFoundError`.
 *
 * The git invocation is injectable via the `runGit` option for unit tests
 * and for environments where `git` is unavailable. The default runner uses
 * `execFileSync` and silently returns an empty string on failure — the
 * caller then surfaces a `ProjectRootNotFoundError`.
 *
 * Pure-ish module: no side effects beyond `existsSync` filesystem reads and
 * an optional `git` subprocess. Safe to import from any layer.
 */

export class ProjectRootNotFoundError extends Error {
  override readonly name = 'ProjectRootNotFoundError'
  constructor(cwd: string, cause?: unknown) {
    super(
      `Could not locate the Anvil project root (no .anvil/ directory found walking up from ${cwd} or from the canonical git-common-dir).`,
    )
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

/**
 * Subprocess-shaped git runner. Receives the argv (already split) and the
 * directory to run in; returns the trimmed stdout. Implementations MUST
 * throw (or return an empty string) when git is unavailable or the command
 * fails — the resolver treats both as "no git answer available."
 */
export type GitRunner = (args: readonly string[], cwd: string) => string

export interface ResolveProjectRootOptions {
  /**
   * Optional injected git runner. Defaults to a `execFileSync('git', ...)`
   * shim that returns `''` on failure. Tests may inject a stub.
   */
  runGit?: GitRunner
}

const ANVIL_DIR = '.anvil'
const GIT_DIR = '.git'

interface WalkResult {
  /** Directory whose `.anvil/` matched, when the fast path succeeds. */
  anvilRoot: string | null
  /** Directory whose `.git` matched, when we hit a repo boundary. */
  gitBoundary: string | null
}

/**
 * Resolves the Anvil project root for a given working directory.
 *
 * Throws `ProjectRootNotFoundError` if neither the upward walk nor the
 * git-common-dir fallback yields a directory containing `.anvil/`.
 */
export async function resolveProjectRoot(
  cwd: string,
  options: ResolveProjectRootOptions = {},
): Promise<string> {
  const start = resolvePath(cwd)

  // 1) Fast path / boundary walk from cwd.
  const first = walkUntilAnvilOrGit(start)
  if (first.anvilRoot !== null) return first.anvilRoot

  // 2) Fallback — ask git for the canonical .git directory.
  const runGit = options.runGit ?? defaultGitRunner
  let gitOut = ''
  let gitErr: unknown = undefined
  const gitCwd = first.gitBoundary ?? start
  try {
    gitOut = runGit(
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      gitCwd,
    ).trim()
  } catch (err) {
    gitErr = err
  }
  if (gitOut.length === 0) {
    throw new ProjectRootNotFoundError(start, gitErr)
  }

  const canonicalRoot = stripTrailingGitDir(gitOut)
  // Walk upward from the canonical root looking only for .anvil/. The git
  // boundary is irrelevant here — we already know we're in the canonical
  // checkout, so an ancestor `.anvil/` would still be a different repo.
  // We therefore restrict the search to the canonical root itself plus any
  // ancestor that does not contain a `.git`.
  const fromCanonical = walkUntilAnvilOrGit(canonicalRoot)
  if (fromCanonical.anvilRoot !== null) return fromCanonical.anvilRoot

  throw new ProjectRootNotFoundError(start)
}

/**
 * Walks upward from `start` and returns the first ancestor containing either
 * a credible `.anvil/` or a `.git`.
 *
 * What counts as "credible":
 * - At `start` itself, a bare `.anvil/` is accepted — the caller explicitly
 *   asked about this directory and we honor it (preserves the pre-ANV-0139
 *   `join(cwd, '.anvil')` contract).
 * - At ancestors, `.anvil/` only counts when co-located with `.git/`. That
 *   rules out stray `/tmp/.anvil/` leftovers on shared dev hosts and stops
 *   the walk from misclassifying a user-scope `~/.anvil/` install.
 * - `.git` (file or directory) marks a repo working-tree boundary. When we
 *   hit `.git` first, the caller's fallback should ask git for the canonical
 *   common-dir (the linked-worktree path).
 *
 * The walk terminates at the first match, at the filesystem root, or at
 * `homedir()` — we never traverse into or past the user's home.
 *
 * Pure; only reads via `existsSync`.
 */
export function walkUntilAnvilOrGit(start: string): WalkResult {
  const startResolved = resolvePath(start)
  let current = startResolved
  const { root } = parse(current)
  const home = resolvePath(homedir())
  // Safety cap: the filesystem can't be that deep.
  for (let i = 0; i < 64; i++) {
    const hasAnvil = existsSync(join(current, ANVIL_DIR))
    const hasGit = existsSync(join(current, GIT_DIR))
    if (hasAnvil && (current === startResolved || hasGit)) {
      return { anvilRoot: current, gitBoundary: null }
    }
    if (hasGit) {
      return { anvilRoot: null, gitBoundary: current }
    }
    if (current === root) break
    if (current === home) break
    const next = dirname(current)
    if (next === current) break
    current = next
  }
  return { anvilRoot: null, gitBoundary: null }
}

/**
 * Strips a trailing `/.git` (or bare `.git`) from a git-common-dir output to
 * yield the canonical repo root. Tolerates trailing slashes and the edge
 * case where git returns `.git` (relative) for the main worktree.
 */
export function stripTrailingGitDir(gitOutput: string): string {
  const s = gitOutput.replace(/\/+$/, '')
  if (s.endsWith('/.git')) return s.slice(0, -'/.git'.length)
  if (s === '.git') return '.'
  return s
}

/**
 * Non-throwing variant of `resolveProjectRoot`. Returns `null` when the
 * project root cannot be located. Useful for hook handlers that must keep
 * running in degraded mode when the user is outside an Anvil project.
 */
export async function findProjectRoot(
  cwd: string,
  options: ResolveProjectRootOptions = {},
): Promise<string | null> {
  try {
    return await resolveProjectRoot(cwd, options)
  } catch {
    return null
  }
}

function defaultGitRunner(args: readonly string[], cwd: string): string {
  try {
    return execFileSync('git', [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return ''
  }
}
