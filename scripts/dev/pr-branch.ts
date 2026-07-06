import { execSync } from 'node:child_process'

/**
 * Paths whose contents are "planning artifacts" — interesting to Anvil sessions
 * but noise on a code-review PR. Widened from a branch-filtering convention that skips a planning directory.
 *
 * ANV-0131: docs/anvil/plans/ and docs/anvil/references/ were moved to
 * .anvil/_archive/docs-anvil/{plans,references}/ — keep old prefixes for
 * backward-compat with git-log entries from before the migration.
 */
const ARTIFACT_PREFIXES = [
  '.anvil/',
  'docs/anvil/plans/',
  'docs/anvil/references/',
  '.anvil/_archive/docs-anvil/plans/',
  '.anvil/_archive/docs-anvil/references/',
  '.planning/',
] as const

export type CommitClass = 'code' | 'artifact' | 'empty'

/**
 * Classify a commit by its file list:
 *   - 'empty'    → no files
 *   - 'artifact' → every file lives under an artifact path
 *   - 'code'     → at least one file lives outside artifact paths
 */
export function classifyCommitFiles(files: string[]): CommitClass {
  if (files.length === 0) return 'empty'
  const allArtifact = files.every((f) =>
    ARTIFACT_PREFIXES.some((p) => f.startsWith(p)),
  )
  return allArtifact ? 'artifact' : 'code'
}

export interface PrBranchOptions {
  base?: string
  branchName?: string
  cwd?: string
  dryRun?: boolean
}

/**
 * Materialize a "clean" PR branch by cherry-picking only commits that touch
 * code (skipping artifact-only commits). The new branch is named
 * `<current>-clean` unless --branch-name is supplied.
 *
 * Generalized to Anvil's artifact paths.
 */
export async function prBranchCommand(
  opts: PrBranchOptions = {},
): Promise<void> {
  const cwd = opts.cwd ?? process.cwd()
  const base = opts.base ?? 'main'

  let current = ''
  try {
    current = execSync('git branch --show-current', {
      cwd,
      encoding: 'utf-8',
    }).trim()
  } catch {
    console.error(
      'pr-branch: not in a git repo (or git not available); aborting.',
    )
    return
  }

  if (!current) {
    console.error('pr-branch: HEAD is detached; aborting.')
    return
  }
  if (current === base) {
    console.error(`pr-branch: already on base branch "${base}"; aborting.`)
    return
  }

  const targetBranch = opts.branchName ?? `${current}-clean`

  // List commits in current..base order (oldest first for cherry-pick).
  const log = execSync(
    `git log --reverse --pretty=format:%H ${base}..${current}`,
    { cwd, encoding: 'utf-8' },
  ).trim()
  if (!log) {
    console.log(
      `pr-branch: no commits between ${base} and ${current}; nothing to do.`,
    )
    return
  }
  const shas = log.split('\n').filter(Boolean)

  const codeShas: string[] = []
  const artifactShas: string[] = []
  for (const sha of shas) {
    const files = execSync(`git show --pretty=format: --name-only ${sha}`, {
      cwd,
      encoding: 'utf-8',
    })
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const klass = classifyCommitFiles(files)
    if (klass === 'code') codeShas.push(sha)
    else if (klass === 'artifact') artifactShas.push(sha)
  }

  console.log(
    `pr-branch: ${codeShas.length} code commit(s), ${artifactShas.length} artifact-only commit(s) on ${current} since ${base}.`,
  )
  if (artifactShas.length > 0) {
    console.log(
      `  Skipped: ${artifactShas.map((s) => s.slice(0, 8)).join(', ')}`,
    )
  }
  if (codeShas.length === 0) {
    console.log(
      'pr-branch: no code commits to materialize; not creating a clean branch.',
    )
    return
  }

  if (opts.dryRun) {
    console.log(
      `pr-branch: would create branch ${targetBranch} from ${base} and cherry-pick ${codeShas.length} commit(s).`,
    )
    return
  }

  // Create new branch from base, cherry-pick code commits.
  execSync(`git checkout -b ${targetBranch} ${base}`, { cwd, stdio: 'pipe' })
  for (const sha of codeShas) {
    try {
      execSync(`git cherry-pick ${sha}`, { cwd, stdio: 'pipe' })
    } catch (err) {
      console.error(
        `pr-branch: cherry-pick failed at ${sha.slice(0, 8)}. Resolve conflicts manually, then \`git cherry-pick --continue\`.`,
      )
      throw err
    }
  }

  console.log(
    `pr-branch: created ${targetBranch} with ${codeShas.length} code commit(s). Push and open a PR from this branch.`,
  )
}

// ---------------------------------------------------------------------------
// CLI entrypoint (when run directly via `bun run scripts/dev/pr-branch.ts`)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2)
  const opts: PrBranchOptions = {
    dryRun: args.includes('--dry-run'),
  }
  const baseIdx = args.indexOf('--base')
  if (baseIdx !== -1 && args[baseIdx + 1]) opts.base = args[baseIdx + 1]
  const branchIdx = args.indexOf('--branch-name')
  if (branchIdx !== -1 && args[branchIdx + 1])
    opts.branchName = args[branchIdx + 1]
  prBranchCommand(opts).catch((err: unknown) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
