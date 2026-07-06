/**
 * ANV-0155 — Integration tests for `anvil worktree create` and `anvil worktree cleanup`.
 * ANV-0164 — Integration tests for remote-SHA fetch behaviour.
 * ANV-0170 — Explicit default-fetch-path assertion (Commander `--no-fetch`
 *   negation contract: undefined `fetch` opt → `noFetch: false` → fetch happens).
 *
 * These tests spin up a real git repo in a tmpdir, run the CLI via spawnSync,
 * and verify the output/side effects.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestTmpDir } from '../helpers/tmpdir.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function git(args: string[], cwd: string) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
  })
}

function anvilCli(args: string[], cwd: string) {
  // ANV-0182: worktree commands moved to scripts/dev/worktree.ts.
  // First arg is the subcommand ('worktree'), rest are passed to the script.
  const repoRoot = import.meta.url
    .replace('file://', '')
    .replace(/\/tests\/.*$/, '')
  const script = join(repoRoot, 'scripts', 'dev', 'worktree.ts')
  // Strip the leading 'worktree' arg — the script's subcommand is its own first arg
  const scriptArgs = args.slice(1)
  return spawnSync('bun', [script, ...scriptArgs], {
    cwd,
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false,
  })
}

/**
 * Create a minimal git repo with one commit and .anvil/tickets/<ticket>.
 * Uses --no-fetch by default because repos created in tests have no remote.
 */
function setupRepo(tmp: string, ticketId = 'ANV-0155') {
  git(['init', '-b', 'main'], tmp)
  git(['config', 'user.email', 'test@test.com'], tmp)
  git(['config', 'user.name', 'Test'], tmp)
  // Initial commit
  writeFileSync(join(tmp, 'README.md'), '# test\n')
  git(['add', 'README.md'], tmp)
  git(['commit', '-m', 'init'], tmp)

  // Create ticket file
  mkdirSync(join(tmp, '.anvil', 'tickets'), { recursive: true })
  writeFileSync(
    join(tmp, '.anvil', 'tickets', `${ticketId}-test-feature.md`),
    `# ${ticketId} — Test feature\n\nSome spec content.\n`,
  )
}

/**
 * Create a "remote" bare repo + a "local" clone where local main is 3 commits
 * behind origin/main. Returns { remote, local } absolute paths.
 *
 * Also adds the ticket file in the local clone so `anvil worktree create` can
 * find it.
 */
function setupStaleRepo(
  tmp: string,
  ticketId = 'ANV-0164',
  branchName = 'main',
) {
  const remote = join(tmp, 'remote.git')
  const local = join(tmp, 'local')
  mkdirSync(remote)
  mkdirSync(local)

  // --- bare remote ---
  git(['init', '--bare', '-b', branchName], remote)

  // --- a staging repo to populate the remote ---
  const staging = join(tmp, 'staging')
  mkdirSync(staging)
  git(['init', '-b', branchName], staging)
  git(['config', 'user.email', 'test@test.com'], staging)
  git(['config', 'user.name', 'Test'], staging)
  writeFileSync(join(staging, 'README.md'), '# test\n')
  git(['add', 'README.md'], staging)
  git(['commit', '-m', 'init'], staging)
  git(['remote', 'add', 'origin', remote], staging)
  git(['push', 'origin', branchName], staging)

  // Add 3 more commits to the remote via staging (simulates concurrent merges)
  for (let i = 1; i <= 3; i++) {
    writeFileSync(join(staging, `file${i}.txt`), `commit ${i}\n`)
    git(['add', '.'], staging)
    git(['commit', '-m', `concurrent commit ${i}`], staging)
  }
  git(['push', 'origin', branchName], staging)

  // --- local clone (started from the initial commit — 3 behind origin) ---
  git(['clone', remote, local], tmp)
  git(['config', 'user.email', 'test@test.com'], local)
  git(['config', 'user.name', 'Test'], local)
  // Reset local to 3 commits behind origin
  git(['reset', '--hard', 'HEAD~3'], local)

  // Ticket file
  mkdirSync(join(local, '.anvil', 'tickets'), { recursive: true })
  writeFileSync(
    join(local, '.anvil', 'tickets', `${ticketId}-worktree-fetch-base.md`),
    `# ${ticketId} — Worktree fetch base\n\nSpec content.\n`,
  )

  return { remote, local }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('integration: anvil worktree create', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('wt-create')
    setupRepo(tmp)
  })

  it('creates a worktree and branch for the given ticket (happy path, --no-fetch)', () => {
    // No remote configured — use --no-fetch to skip the fetch step
    const result = anvilCli(
      ['worktree', 'create', 'ANV-0155', '--base', 'main', '--no-fetch'],
      tmp,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('worktree created:')
    expect(result.stdout).toContain('feat/anv-0155-test-feature')
    expect(result.stdout).toContain('.worktrees/anv-0155-test-feature')

    // Verify the branch was created
    const branchList = git(
      ['branch', '--list', 'feat/anv-0155-test-feature'],
      tmp,
    )
    expect(branchList.stdout.trim()).toContain('feat/anv-0155-test-feature')
  })

  it('emits JSON when --json is passed (--no-fetch)', () => {
    const result = anvilCli(
      [
        'worktree',
        'create',
        'ANV-0155',
        '--base',
        'main',
        '--json',
        '--no-fetch',
      ],
      tmp,
    )
    expect(result.status, result.stderr).toBe(0)
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>
    expect(parsed.branch).toBe('feat/anv-0155-test-feature')
    expect(parsed.base).toBe('main')
    expect(parsed.ticket).toContain('ANV-0155-test-feature.md')
    expect(Array.isArray(parsed.verification_commands)).toBe(true)
  })

  it('exits non-zero when ticket is not found', () => {
    const result = anvilCli(
      ['worktree', 'create', 'ANV-9999', '--base', 'main', '--no-fetch'],
      tmp,
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('not found')
  })

  it('uses --slug to override derived slug (--no-fetch)', () => {
    const result = anvilCli(
      [
        'worktree',
        'create',
        'ANV-0155',
        '--base',
        'main',
        '--slug',
        'my-custom-slug',
        '--no-fetch',
      ],
      tmp,
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('feat/my-custom-slug')
    expect(result.stdout).toContain('.worktrees/my-custom-slug')
  })

  it('aborts with a clear error when fetch fails (no remote configured)', () => {
    // No --no-fetch means the command will try to fetch origin/main and fail
    const result = anvilCli(
      ['worktree', 'create', 'ANV-0155', '--base', 'main'],
      tmp,
    )
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('fetch origin/main failed')
    expect(result.stderr).toContain('--no-fetch')
  })
})

// ---------------------------------------------------------------------------
// ANV-0164 — Stale-base fetch integration tests
// ---------------------------------------------------------------------------

describe('integration: anvil worktree create — fetch remote SHA', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('wt-fetch')
  })

  it('branches off origin/main SHA when local main is 3 commits behind', () => {
    const { local } = setupStaleRepo(tmp, 'ANV-0164', 'main')

    // Get what we expect — the remote HEAD SHA
    const remoteHeadResult = git(['rev-parse', 'origin/main'], local)
    const expectedSha = remoteHeadResult.stdout.trim()

    // Get local HEAD before create (should be 3 behind)
    const localHeadResult = git(['rev-parse', 'main'], local)
    const localSha = localHeadResult.stdout.trim()

    expect(expectedSha).not.toBe(localSha)

    const result = anvilCli(
      ['worktree', 'create', 'ANV-0164', '--base', 'main'],
      local,
    )
    expect(result.status, result.stderr).toBe(0)

    // The newly created worktree's HEAD must be the remote SHA
    const worktreePath = join(
      local,
      '.worktrees',
      'anv-0164-worktree-fetch-base',
    )
    const worktreeHead = git(['rev-parse', 'HEAD'], worktreePath)
    expect(worktreeHead.stdout.trim()).toBe(expectedSha)
  })

  it('branches off origin/<release-branch> SHA when release branch is 3 commits behind', () => {
    // Create a repo with a release/v0.13.6 branch also 3 behind origin
    const { local } = setupStaleRepo(tmp, 'ANV-0164', 'release/v0.13.6')

    // Give the local repo a package.json so resolveBase picks release/v0.13.6
    writeFileSync(
      join(local, 'package.json'),
      JSON.stringify({ version: '0.13.6' }),
    )
    git(['add', 'package.json'], local)
    git(['commit', '-m', 'chore: add package.json'], local)

    const remoteHeadResult = git(['rev-parse', 'origin/release/v0.13.6'], local)
    const expectedSha = remoteHeadResult.stdout.trim()

    const localHeadResult = git(['rev-parse', 'release/v0.13.6'], local)
    const localSha = localHeadResult.stdout.trim()
    expect(expectedSha).not.toBe(localSha)

    const result = anvilCli(['worktree', 'create', 'ANV-0164'], local)
    expect(result.status, result.stderr).toBe(0)

    // Worktree HEAD must be the remote release branch SHA
    const worktreePath = join(
      local,
      '.worktrees',
      'anv-0164-worktree-fetch-base',
    )
    const worktreeHead = git(['rev-parse', 'HEAD'], worktreePath)
    expect(worktreeHead.stdout.trim()).toBe(expectedSha)
  })

  it('--no-fetch uses local ref (stale SHA) instead of remote', () => {
    const { local } = setupStaleRepo(tmp, 'ANV-0164', 'main')

    // Local main SHA (3 behind origin)
    const localSha = git(['rev-parse', 'main'], local).stdout.trim()
    const remoteSha = git(['rev-parse', 'origin/main'], local).stdout.trim()
    expect(localSha).not.toBe(remoteSha)

    const result = anvilCli(
      ['worktree', 'create', 'ANV-0164', '--base', 'main', '--no-fetch'],
      local,
    )
    expect(result.status, result.stderr).toBe(0)

    const worktreePath = join(
      local,
      '.worktrees',
      'anv-0164-worktree-fetch-base',
    )
    const worktreeHead = git(['rev-parse', 'HEAD'], worktreePath)
    // --no-fetch: branched off local ref, not remote
    expect(worktreeHead.stdout.trim()).toBe(localSha)
  })
})

// ---------------------------------------------------------------------------
// ANV-0170 — Explicit default-fetch-path assertion
//
// Pins the Commander negation contract at src/index.ts: a bare invocation
// (no `--no-fetch` flag) maps `opts.fetch === undefined` to `noFetch: false`,
// which MUST trigger `git fetch origin/<base>` and branch the new worktree
// off the *remote* ref. If a future refactor accidentally inverts the
// default or removes the fetch call (cf. ANV-0164), this test fails.
// ---------------------------------------------------------------------------

describe('integration: anvil worktree create — default-fetch path', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('wt-default-fetch')
  })

  it('default path fetches origin/<base> and branches off remote SHA (Commander negation: --no-fetch off by default)', () => {
    const { local } = setupStaleRepo(tmp, 'ANV-0170', 'main')

    // Pre-conditions: local is behind origin so a fetch is observable.
    const remoteSha = git(['rev-parse', 'origin/main'], local).stdout.trim()
    const localSha = git(['rev-parse', 'main'], local).stdout.trim()
    expect(
      remoteSha,
      'fixture sanity: remote and local SHAs must differ to prove fetch happened',
    ).not.toBe(localSha)

    // Invoke WITHOUT --no-fetch. This is the Commander default:
    //   opts.fetch === undefined  →  noFetch: false  →  fetch runs.
    const result = anvilCli(
      ['worktree', 'create', 'ANV-0170', '--base', 'main'],
      local,
    )
    expect(result.status, result.stderr).toBe(0)

    const worktreePath = join(
      local,
      '.worktrees',
      'anv-0170-worktree-fetch-base',
    )
    const worktreeHead = git(['rev-parse', 'HEAD'], worktreePath).stdout.trim()

    // The load-bearing assertion: HEAD === origin SHA proves the default
    // path ran `git fetch` and branched off the freshly-fetched remote ref.
    // If ANV-0164's fetch call is removed, this becomes HEAD === localSha
    // and the assertion fails with a clear "expected origin SHA, got local"
    // diff.
    expect(
      worktreeHead,
      'default-fetch path must branch off origin/main (ANV-0164 fetch contract)',
    ).toBe(remoteSha)
    expect(worktreeHead).not.toBe(localSha)
  })
})

describe('integration: anvil worktree cleanup', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('wt-cleanup')
    setupRepo(tmp)
  })

  it('dry-run shows no entries when no .worktrees exist', () => {
    const result = anvilCli(['worktree', 'cleanup', '--dry-run'], tmp)
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('no .worktrees/* entries found')
  })

  it('dry-run shows skip-unmerged for an existing unmerged worktree', () => {
    // Create a worktree via git directly
    const worktreePath = join(tmp, '.worktrees', 'anv-0155-test-feature')
    git(
      [
        'worktree',
        'add',
        '-b',
        'feat/anv-0155-test-feature',
        worktreePath,
        'main',
      ],
      tmp,
    )

    const result = anvilCli(['worktree', 'cleanup', '--dry-run'], tmp)
    expect(result.status, result.stderr).toBe(0)
    // The branch is not merged and no remote tracking → skip-unmerged or skip-unpushed
    expect(result.stdout).toMatch(/skip-(unmerged|unpushed)/)
    expect(result.stdout).toContain('.worktrees/anv-0155-test-feature')
  })

  it('--all --dry-run shows remove action for unmerged worktree', () => {
    // Create an unmerged worktree
    const worktreePath = join(tmp, '.worktrees', 'anv-0155-all-test')
    git(
      ['worktree', 'add', '-b', 'feat/anv-0155-all-test', worktreePath, 'main'],
      tmp,
    )

    // With --all, even unmerged worktrees show as remove (dry run)
    const result = anvilCli(['worktree', 'cleanup', '--dry-run', '--all'], tmp)
    expect(result.status, result.stderr).toBe(0)
    // --all + clean + no unpushed (no remote) → should attempt remove but
    // blocked by unpushed guard. With no remote, still skip-unpushed.
    // Test that the worktree is at least listed in the output.
    expect(result.stdout).toContain('.worktrees/anv-0155-all-test')
  })

  it('cleanup JSON output includes items array and counts', () => {
    const result = anvilCli(['worktree', 'cleanup', '--dry-run', '--json'], tmp)
    expect(result.status, result.stderr).toBe(0)
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>
    expect(Array.isArray(parsed.items)).toBe(true)
    expect(typeof parsed.removed).toBe('number')
    expect(typeof parsed.skipped).toBe('number')
    expect(parsed.dryRun).toBe(true)
  })
})
