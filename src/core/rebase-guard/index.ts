/**
 * ANV-0144 — Pre-rebase stale-base guard (core logic).
 *
 * Pure functions that compare a feature branch's fork point against the
 * upstream release branch tip. Consumed by:
 *   - scripts/ci/check-rebase-base.ts (CLI runner)
 *   - src/commands/cli/doctor.ts (doctor row)
 *
 * No I/O except through the injected `runGit` callback.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RebaseBaseStatus = 'pass' | 'warn' | 'fail' | 'skip'

export interface RebaseBaseResult {
  status: RebaseBaseStatus
  /** Number of commits the release branch is ahead of the fork point. */
  baseAhead: number
  /** The SHA of the fork point (merge-base). Empty string when skipped. */
  forkPoint: string
  /** The release branch name used for the comparison. */
  releaseBranch: string
  /** Human-readable explanation. */
  reason: string
}

export interface CheckRebaseBaseOpts {
  /** Injected git command runner — takes varargs and returns stdout string. */
  runGit: (...args: string[]) => string
  /**
   * The release branch to compare against.
   * When omitted the caller must derive it.
   */
  releaseBranch?: string
  /** When true, stale base → fail instead of warn. */
  strict?: boolean
  /**
   * Explicit current branch name (for testing). When omitted, derived via
   * `git rev-parse --abbrev-ref HEAD`.
   */
  currentBranch?: string
}

// ---------------------------------------------------------------------------
// Release branch derivation
// ---------------------------------------------------------------------------

/**
 * Derive the default release branch from package.json version.
 *
 * ANV-0144 spec: "version + 1 patch (e.g. version 0.13.1 → release/v0.13.2)"
 * The package.json version is the *last shipped* version; the in-progress
 * release branch is one patch higher.
 *
 * Override via `ANVIL_RELEASE_BRANCH` env var (passed by caller).
 *
 * @param packageVersion - version string from package.json (e.g. "0.13.1")
 * @param envOverride    - value of ANVIL_RELEASE_BRANCH, if set
 */
export function deriveReleaseBranch(
  packageVersion: string,
  envOverride?: string,
): string {
  if (envOverride) return envOverride

  const parts = packageVersion.split('.')
  if (parts.length < 3) return `release/v${packageVersion}`
  const major = parts[0] ?? '0'
  const minor = parts[1] ?? '0'
  const patch = Number.parseInt(parts[2] ?? '0', 10)
  // +1 patch: if package.json says 0.13.1 the in-progress branch is 0.13.2
  return `release/v${major}.${minor}.${patch + 1}`
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

/**
 * Pure function: run the stale-base check.
 * Takes an injected `runGit` so tests don't need a real repo.
 */
export async function checkRebaseBase(
  opts: CheckRebaseBaseOpts,
): Promise<RebaseBaseResult> {
  const { runGit, strict = false } = opts

  // 1. Determine current branch.
  let currentBranch: string
  try {
    currentBranch =
      opts.currentBranch ?? runGit('rev-parse', '--abbrev-ref', 'HEAD').trim()
  } catch {
    return {
      status: 'skip',
      baseAhead: 0,
      forkPoint: '',
      releaseBranch: opts.releaseBranch ?? '',
      reason: 'not in a git repository',
    }
  }

  // 2. Skip when on protected branches.
  const skip = (reason: string): RebaseBaseResult => ({
    status: 'skip',
    baseAhead: 0,
    forkPoint: '',
    releaseBranch: opts.releaseBranch ?? '',
    reason,
  })

  if (
    currentBranch === 'main' ||
    currentBranch === 'master' ||
    currentBranch === 'HEAD'
  ) {
    return skip(`on ${currentBranch} — no base check needed`)
  }

  // 3. Resolve the release branch.
  const releaseBranch = opts.releaseBranch ?? ''
  if (!releaseBranch) {
    return skip('no release branch resolved')
  }

  if (currentBranch === releaseBranch) {
    return skip(`on release branch (${releaseBranch}) — no base check needed`)
  }

  // 4. Check that the upstream release branch exists.
  const remoteRef = `origin/${releaseBranch}`
  let remoteRefExists: boolean
  try {
    runGit('rev-parse', '--verify', remoteRef)
    remoteRefExists = true
  } catch {
    remoteRefExists = false
  }

  // Also try the bare branch name (local tracking).
  let refToUse = remoteRef
  if (!remoteRefExists) {
    try {
      runGit('rev-parse', '--verify', releaseBranch)
      refToUse = releaseBranch
    } catch {
      return skip(
        `release branch ${releaseBranch} not found locally or as origin/${releaseBranch}`,
      )
    }
  }

  // 5. Find the fork point.
  let forkPoint: string
  try {
    forkPoint = runGit('merge-base', 'HEAD', refToUse).trim()
  } catch {
    return skip(`could not compute merge-base between HEAD and ${refToUse}`)
  }

  // 6. Count commits the release branch is ahead of the fork point.
  let behindCount: number
  try {
    const out = runGit(
      'rev-list',
      '--count',
      `${forkPoint}..${refToUse}`,
    ).trim()
    behindCount = Number.parseInt(out, 10)
    if (!Number.isFinite(behindCount)) behindCount = 0
  } catch {
    return skip(`could not count commits between ${forkPoint} and ${refToUse}`)
  }

  const forkShort = forkPoint.slice(0, 8)

  if (behindCount === 0) {
    return {
      status: 'pass',
      baseAhead: 0,
      forkPoint,
      releaseBranch,
      reason: `branch ${currentBranch} is up to date with ${releaseBranch} (fork point ${forkShort})`,
    }
  }

  const warnOrFail: RebaseBaseStatus = strict ? 'fail' : 'warn'
  return {
    status: warnOrFail,
    baseAhead: behindCount,
    forkPoint,
    releaseBranch,
    reason: `branch ${currentBranch} is ${behindCount} commit(s) behind ${releaseBranch} (last fetched ${forkShort}). Run \`git fetch && git rebase origin/${releaseBranch}\` to refresh.`,
  }
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

export function formatPlainText(result: RebaseBaseResult): string {
  return `worktree base freshness: ${result.status.toUpperCase()} — ${result.reason}`
}

export function formatJson(result: RebaseBaseResult): string {
  return JSON.stringify(result, null, 2)
}
