import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { maybeEmitJson } from '../../src/commands/cli/common/json-mode.js'
import type { WorktreeEntry } from '../../src/core/worktree/types.js'

/**
 * ANV-0155 — `anvil worktree create` / `anvil worktree cleanup` commands.
 * ANV-0164 — Fetch origin/<base> before branching to avoid stale-base branches.
 * ANV-0169 — Bounded fetch via ANVIL_GIT_FETCH_TIMEOUT_MS (default 30000).
 *
 * Layer 4 command implementation.
 * This is the ONLY file in the codebase that calls spawnSync('git', ...).
 * All git invocations use shell: false — no string interpolation.
 *
 * Hard rules (enforced here + in architecture test):
 *   - NEVER touch .claude/worktrees/* (isProtectedPath guard)
 *   - NEVER delete a branch with unpushed commits unless --force
 *   - NEVER rm -rf a worktree — always use git worktree remove
 *   - NEVER touch the primary worktree
 */

/** Default timeout for `git fetch origin/<base>` in worktree create (ANV-0169). */
export const DEFAULT_GIT_FETCH_TIMEOUT_MS = 30_000

/**
 * Resolve the git fetch timeout from `ANVIL_GIT_FETCH_TIMEOUT_MS`.
 *
 * - Unset / empty → DEFAULT_GIT_FETCH_TIMEOUT_MS (30000).
 * - Positive integer → that value.
 * - Non-numeric, negative, zero, NaN → falls back to default (rejected).
 */
export function resolveFetchTimeoutMs(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = env.ANVIL_GIT_FETCH_TIMEOUT_MS
  if (raw === undefined || raw === '') return DEFAULT_GIT_FETCH_TIMEOUT_MS
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GIT_FETCH_TIMEOUT_MS
  }
  return parsed
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runGit(args: string[], cwd: string): { stdout: string; ok: boolean } {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
  })
  return {
    stdout: typeof result.stdout === 'string' ? result.stdout.trim() : '',
    ok: result.status === 0,
  }
}

function getRepoRoot(cwd: string): string | null {
  const { stdout, ok } = runGit(['rev-parse', '--show-toplevel'], cwd)
  return ok ? stdout : null
}

function getPkgVersion(repoRoot: string): string {
  try {
    const pkgPath = join(repoRoot, 'package.json')
    const raw = readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/**
 * Resolve the base branch in priority order:
 *   1. opts.base (explicit --base flag)
 *   2. release/v<pkg.version> if it exists locally or as origin/<branch>
 *   3. main
 */
function resolveBase(
  explicitBase: string | undefined,
  repoRoot: string,
  cwd: string,
): string {
  if (explicitBase) return explicitBase

  const version = getPkgVersion(repoRoot)
  const releaseBranch = `release/v${version}`
  const localCheck = runGit(['rev-parse', '--verify', releaseBranch], cwd)
  if (localCheck.ok) return releaseBranch
  const remoteCheck = runGit(
    ['rev-parse', '--verify', `origin/${releaseBranch}`],
    cwd,
  )
  if (remoteCheck.ok) return releaseBranch

  return 'main'
}

/**
 * Fetch `origin/<base>` and return the remote SHA to branch from (ANV-0164).
 *
 * Applies to all three resolveBase outputs — opts.base, release/v<version>,
 * and main — since all are equally subject to lag in multi-agent sessions.
 *
 * ANV-0169: The fetch is bounded by `ANVIL_GIT_FETCH_TIMEOUT_MS` (default
 * 30000ms). On timeout `spawnSync` returns `{ signal: 'SIGTERM' }` — that's
 * the discriminator for the distinct error branch. Single-shot (no retry).
 *
 * @param base   The resolved base branch name (e.g. "main", "release/v0.13.5")
 * @param repoRoot  Absolute path to the repo root
 * @returns The remote SHA string on success
 * @throws  Writes to stderr and exits with code 1 on fetch failure or timeout
 */
export function fetchRemoteBase(base: string, repoRoot: string): string {
  const timeoutMs = resolveFetchTimeoutMs()
  const fetchResult = spawnSync('git', ['fetch', 'origin', base], {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
    timeout: timeoutMs,
  })

  // Node's spawnSync sets `signal: 'SIGTERM'` when the timeout fires.
  if (fetchResult.signal === 'SIGTERM') {
    process.stderr.write(
      `git fetch origin/${base} timed out after ${timeoutMs} ms — pass --no-fetch or set ANVIL_GIT_FETCH_TIMEOUT_MS=<higher>\n`,
    )
    process.exit(1)
  }

  if (fetchResult.status !== 0) {
    process.stderr.write(
      `Cannot create worktree: fetch origin/${base} failed — pass --no-fetch to use the local ref\n`,
    )
    process.exit(1)
  }

  const shaResult = runGit(['rev-parse', `origin/${base}`], repoRoot)
  if (!shaResult.ok) {
    process.stderr.write(
      `Cannot create worktree: rev-parse origin/${base} failed after fetch\n`,
    )
    process.exit(1)
  }

  return shaResult.stdout
}

/**
 * Parse `git worktree list --porcelain` output into WorktreeEntry[].
 */
function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: Partial<WorktreeEntry> = {}

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path !== undefined) {
        entries.push({
          path: current.path,
          branch: current.branch,
          head: current.head,
          bare: current.bare ?? false,
        })
      }
      current = { path: line.slice('worktree '.length), bare: false }
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      // branch refs/heads/feat/anv-0155 → strip refs/heads/
      const ref = line.slice('branch '.length)
      current.branch = ref.startsWith('refs/heads/')
        ? ref.slice('refs/heads/'.length)
        : ref
    } else if (line === 'bare') {
      current.bare = true
    }
  }

  // Push last entry
  if (current.path !== undefined) {
    entries.push({
      path: current.path,
      branch: current.branch,
      head: current.head,
      bare: current.bare ?? false,
    })
  }

  return entries
}

// ---------------------------------------------------------------------------
// Create command
// ---------------------------------------------------------------------------

export interface WorktreeCreateOptions {
  ticketFile?: string
  base?: string
  slug?: string
  json?: boolean
  /** Skip `git fetch origin/<base>` and use the local ref as-is (offline use). */
  noFetch?: boolean
}

export async function worktreeCreateCommand(
  ticketId: string,
  opts: WorktreeCreateOptions,
): Promise<void> {
  const cwd = process.cwd()
  const repoRoot = getRepoRoot(cwd)
  if (!repoRoot) {
    process.stderr.write('worktree create: not in a git repository\n')
    process.exit(1)
  }

  // Lazy-import core modules (layer 0 — no circular risk)
  const { findTicketFile, readSpecExcerpt } = await import(
    '../../src/core/worktree/discover.js'
  )
  const { deriveSlug } = await import('../../src/core/worktree/slug.js')

  // 1. Resolve ticket file
  let ticketPath: string
  let header: string

  if (opts.ticketFile) {
    if (!existsSync(opts.ticketFile)) {
      process.stderr.write(
        `worktree create: ticket file not found: ${opts.ticketFile}\n`,
      )
      process.exit(1)
    }
    ticketPath = opts.ticketFile
    try {
      const content = readFileSync(ticketPath, 'utf-8')
      const h1 = content.split('\n').find((l) => l.startsWith('# '))
      header = h1 ? h1.slice(2).trim() : ticketId
    } catch {
      header = ticketId
    }
  } else {
    const found = findTicketFile(ticketId, repoRoot)
    if (!found) {
      process.stderr.write(
        `worktree create: ticket file for ${ticketId} not found in .anvil/tickets/\n  Use --ticket-file <path> to specify the file explicitly.\n`,
      )
      process.exit(1)
    }
    ticketPath = found.path
    header = found.header
  }

  // 2. Derive slug
  let slug: string
  if (opts.slug) {
    slug = opts.slug
  } else {
    try {
      slug = deriveSlug(header)
    } catch (err) {
      process.stderr.write(
        `worktree create: slug derivation failed — ${err instanceof Error ? err.message : String(err)}\n  Use --slug <slug> to override.\n`,
      )
      process.exit(1)
    }
  }

  // 3. Resolve base
  const base = resolveBase(opts.base, repoRoot, cwd)

  // 3a. Fetch origin/<base> to get the up-to-date remote SHA (ANV-0164).
  // All three resolveBase outputs (opts.base, release/v<version>, main) are
  // subject to lag in multi-agent sessions where main is updated by a concurrent
  // merge. --no-fetch restores the old behaviour for offline use.
  const startSha = opts.noFetch ? base : fetchRemoteBase(base, repoRoot)

  // 4. Create worktree
  const branch = `feat/${slug}`
  const worktreePath = join(repoRoot, '.worktrees', slug)

  if (existsSync(worktreePath)) {
    process.stderr.write(
      `worktree create: path already exists: ${worktreePath}\n`,
    )
    process.exit(1)
  }

  const addResult = runGit(
    ['worktree', 'add', '-b', branch, worktreePath, startSha],
    repoRoot,
  )
  if (!addResult.ok) {
    process.stderr.write('worktree create: git worktree add failed\n')
    process.exit(1)
  }

  // 5. Read spec excerpt
  const specExcerpt = readSpecExcerpt(ticketPath, 300)

  // 6. Build verification commands
  const worktreeRelPath = relative(repoRoot, worktreePath)
  const verificationCommands = [
    `cd ${worktreeRelPath} && bun install`,
    `cd ${worktreeRelPath} && bun run gate`,
  ]

  const result = {
    branch,
    worktree: worktreePath,
    base,
    ticket: ticketPath,
    spec_excerpt: specExcerpt,
    verification_commands: verificationCommands,
  }

  if (maybeEmitJson(result, opts)) return

  // Human-readable output
  process.stdout.write(
    `${[
      'worktree created:',
      `  branch:   ${branch}`,
      `  worktree: ${worktreePath}`,
      `  base:     ${base}`,
      `  ticket:   ${ticketPath}`,
      '',
      '# spec excerpt:',
      specExcerpt,
      '',
      '# verification:',
      ...verificationCommands.map((c) => `  ${c}`),
    ].join('\n')}\n`,
  )
}

// ---------------------------------------------------------------------------
// Cleanup command
// ---------------------------------------------------------------------------

export interface WorktreeCleanupOptions {
  all?: boolean
  force?: boolean
  dryRun?: boolean
  json?: boolean
}

export async function worktreeCleanupCommand(
  opts: WorktreeCleanupOptions,
): Promise<void> {
  const cwd = process.cwd()
  const repoRoot = getRepoRoot(cwd)
  if (!repoRoot) {
    process.stderr.write('worktree cleanup: not in a git repository\n')
    process.exit(1)
  }

  const { isProtectedPath, isAnvilWorktreePath, classifyWorktreeEntry } =
    await import('../../src/core/worktree/predicates.js')

  // 1. Get primary worktree path
  const toplevelResult = runGit(['rev-parse', '--show-toplevel'], repoRoot)
  const primaryPath = toplevelResult.ok ? toplevelResult.stdout : repoRoot

  // 2. List all worktrees
  const listResult = runGit(['worktree', 'list', '--porcelain'], repoRoot)
  if (!listResult.ok) {
    process.stderr.write('worktree cleanup: failed to list worktrees\n')
    process.exit(1)
  }

  const worktrees = parseWorktreeList(listResult.stdout)

  // 3. Get merged branches for the release branch
  const pkgVersion = getPkgVersion(repoRoot)
  const releaseBranch = `release/v${pkgVersion}`
  const mergeTarget = (() => {
    const relCheck = runGit(['rev-parse', '--verify', releaseBranch], repoRoot)
    if (relCheck.ok) return releaseBranch
    return 'main'
  })()

  const mergedResult = runGit(['branch', '--merged', mergeTarget], repoRoot)
  const mergedBranches = mergedResult.ok
    ? mergedResult.stdout.split('\n').map((b) => b.replace(/^\*\s*/, '').trim())
    : []

  // 4. Classify each worktree
  const { CleanupItem } = await import('../../src/core/worktree/types.js')
  const { isMergedBranch, hasUnpushedCommits, isDirtyTree } = await import(
    '../../src/core/worktree/predicates.js'
  )

  const items: Array<{
    path: string
    branch?: string
    action:
      | 'remove'
      | 'skip-dirty'
      | 'skip-unmerged'
      | 'skip-unpushed'
      | 'skip-primary'
    reason: string
  }> = []

  for (const entry of worktrees) {
    // Skip primary silently
    if (entry.path === primaryPath) continue
    // Skip protected paths silently
    if (isProtectedPath(entry.path)) continue
    // Skip non-.worktrees paths silently
    if (!isAnvilWorktreePath(entry.path)) continue

    const branch = entry.branch

    // Check dirty
    const statusResult = runGit(['status', '--porcelain'], entry.path)
    const dirty = statusResult.ok ? isDirtyTree(statusResult.stdout) : false

    // Check merged
    const merged = branch ? isMergedBranch(branch, mergedBranches) : false

    // Check unpushed
    let unpushed = false
    if (branch) {
      const localShaResult = runGit(['rev-parse', branch], repoRoot)
      const remoteShaResult = runGit(
        ['rev-parse', `origin/${branch}`],
        repoRoot,
      )
      if (localShaResult.ok) {
        unpushed = hasUnpushedCommits(
          localShaResult.stdout,
          remoteShaResult.ok ? remoteShaResult.stdout : null,
        )
      }
    }

    const { action, reason } = classifyWorktreeEntry(entry, {
      primaryPath,
      isDirty: dirty,
      isMerged: merged,
      hasUnpushed: unpushed,
      force: opts.force ?? false,
      all: opts.all ?? false,
    })

    items.push({ path: entry.path, branch, action, reason })
  }

  const dryRun = opts.dryRun ?? false

  if (dryRun || opts.json) {
    const result = {
      items: items.map((i) => CleanupItem.parse(i)),
      removed: items.filter((i) => i.action === 'remove').length,
      skipped: items.filter((i) => i.action !== 'remove').length,
      dryRun,
    }

    if (maybeEmitJson(result, opts)) return

    // Dry-run human-readable table
    process.stdout.write('worktree cleanup (dry run):\n\n')
    if (items.length === 0) {
      process.stdout.write('  no .worktrees/* entries found\n')
      return
    }
    for (const item of items) {
      process.stdout.write(
        `  ${item.action.padEnd(15)} ${item.path}  (${item.reason})\n`,
      )
    }
    process.stdout.write(
      `\n  would remove: ${result.removed}, would skip: ${result.skipped}\n`,
    )
    return
  }

  // 5. Execute cleanup
  let removed = 0
  let skipped = 0

  for (const item of items) {
    if (item.action !== 'remove') {
      skipped++
      process.stdout.write(`skip ${item.path}: ${item.reason}\n`)
      continue
    }

    // Unlock best-effort
    runGit(['worktree', 'unlock', item.path], repoRoot)

    // Remove worktree via git worktree remove (NEVER rm -rf)
    const removeResult = runGit(['worktree', 'remove', item.path], repoRoot)
    if (!removeResult.ok) {
      process.stderr.write(
        `worktree cleanup: git worktree remove failed for ${item.path} — skipping\n`,
      )
      skipped++
      continue
    }

    // Delete the branch (only if clean push state OR --force)
    if (item.branch) {
      const deleteFlag = opts.force ? '-D' : '-d'
      runGit(['branch', deleteFlag, item.branch], repoRoot)
    }

    process.stdout.write(`removed ${item.path}\n`)
    removed++
  }

  // 6. Prune stale worktree metadata
  runGit(['worktree', 'prune'], repoRoot)

  process.stdout.write(
    `\nworktree cleanup complete: ${removed} removed, ${skipped} skipped\n`,
  )
}

// ---------------------------------------------------------------------------
// CLI entrypoint (when run directly via `bun run scripts/dev/worktree.ts`)
// ---------------------------------------------------------------------------

if (import.meta.main) {
  const args = process.argv.slice(2)
  const subcommand = args[0]
  if (subcommand === 'create') {
    const ticketId = args[1]
    if (!ticketId) {
      process.stderr.write(
        'Usage: bun run scripts/dev/worktree.ts create <ticket-id> [--base <branch>] [--slug <slug>] [--ticket-file <path>] [--json] [--no-fetch]\n',
      )
      process.exit(1)
    }
    const opts: WorktreeCreateOptions = {
      json: args.includes('--json'),
      noFetch: args.includes('--no-fetch'),
    }
    const baseIdx = args.indexOf('--base')
    if (baseIdx !== -1 && args[baseIdx + 1]) opts.base = args[baseIdx + 1]
    const slugIdx = args.indexOf('--slug')
    if (slugIdx !== -1 && args[slugIdx + 1]) opts.slug = args[slugIdx + 1]
    const tfIdx = args.indexOf('--ticket-file')
    if (tfIdx !== -1 && args[tfIdx + 1]) opts.ticketFile = args[tfIdx + 1]
    worktreeCreateCommand(ticketId, opts).catch((err: unknown) => {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exit(1)
    })
  } else if (subcommand === 'cleanup') {
    const opts: WorktreeCleanupOptions = {
      all: args.includes('--all'),
      force: args.includes('--force'),
      dryRun: args.includes('--dry-run'),
      json: args.includes('--json'),
    }
    worktreeCleanupCommand(opts).catch((err: unknown) => {
      process.stderr.write(
        `${err instanceof Error ? err.message : String(err)}\n`,
      )
      process.exit(1)
    })
  } else {
    process.stderr.write(
      'Usage: bun run scripts/dev/worktree.ts <create|cleanup> [options]\n',
    )
    process.exit(1)
  }
}
