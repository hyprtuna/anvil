import { join } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
/**
 * ANV-0144 — Unit tests for scripts/ci/check-rebase-base.ts
 *
 * Tests the pure logic: version → release-branch derivation, env override,
 * CLI override, output formatting (plain + JSON), and the core check function
 * with mocked git commands.
 */
import { describe, expect, it } from 'vitest'
import { readPackageVersion } from '../../../scripts/ci/check-rebase-base.js'
import {
  type RebaseBaseResult,
  checkRebaseBase,
  deriveReleaseBranch,
  formatJson,
  formatPlainText,
} from '../../../src/core/rebase-guard/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..', '..', '..')

// ---------------------------------------------------------------------------
// deriveReleaseBranch
// ---------------------------------------------------------------------------

describe('deriveReleaseBranch', () => {
  it('derives release/v0.13.2 from 0.13.1 (next patch)', () => {
    expect(deriveReleaseBranch('0.13.1')).toBe('release/v0.13.2')
  })

  it('derives release/v0.14.0 from 0.13.9 (patch rollover not clamped)', () => {
    // Not a semver major bump — just +1 patch arithmetic
    expect(deriveReleaseBranch('0.13.9')).toBe('release/v0.13.10')
  })

  it('respects ANVIL_RELEASE_BRANCH env override', () => {
    expect(deriveReleaseBranch('0.13.1', 'release/v0.99.0')).toBe(
      'release/v0.99.0',
    )
  })

  it('handles version with only major.minor (no patch)', () => {
    // Graceful fallback when parts.length < 3
    expect(deriveReleaseBranch('0.13')).toBe('release/v0.13')
  })

  it('env override wins over version derivation', () => {
    expect(deriveReleaseBranch('1.0.0', 'main')).toBe('main')
  })
})

// ---------------------------------------------------------------------------
// readPackageVersion
// ---------------------------------------------------------------------------

describe('readPackageVersion', () => {
  it('reads the project package.json version', () => {
    const version = readPackageVersion(ROOT)
    expect(typeof version).toBe('string')
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('returns 0.0.0 for non-existent path', () => {
    expect(readPackageVersion('/non/existent/path')).toBe('0.0.0')
  })
})

// ---------------------------------------------------------------------------
// checkRebaseBase — skip scenarios
// ---------------------------------------------------------------------------

describe('checkRebaseBase — skip scenarios', () => {
  const noop = (): string => ''

  it('skips on main branch', async () => {
    const result = await checkRebaseBase({
      runGit: (cmd) => (cmd === 'rev-parse' ? 'main\n' : noop()),
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'main',
    })
    expect(result.status).toBe('skip')
    expect(result.reason).toContain('main')
  })

  it('skips on master branch', async () => {
    const result = await checkRebaseBase({
      runGit: noop,
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'master',
    })
    expect(result.status).toBe('skip')
  })

  it('skips when current branch IS the release branch', async () => {
    const result = await checkRebaseBase({
      runGit: noop,
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'release/v0.13.2',
    })
    expect(result.status).toBe('skip')
    expect(result.reason).toContain('release branch')
  })

  it('skips when no release branch is provided', async () => {
    const result = await checkRebaseBase({
      runGit: noop,
      releaseBranch: '',
      currentBranch: 'feat/some-feature',
    })
    expect(result.status).toBe('skip')
  })

  it('skips when release branch not found in git', async () => {
    const result = await checkRebaseBase({
      runGit: (cmd, ...args) => {
        if (cmd === 'rev-parse' && args.includes('--verify')) {
          throw new Error('unknown revision')
        }
        return ''
      },
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'feat/some-feature',
    })
    expect(result.status).toBe('skip')
    expect(result.reason).toContain('not found')
  })
})

// ---------------------------------------------------------------------------
// checkRebaseBase — pass / warn / fail scenarios
// ---------------------------------------------------------------------------

describe('checkRebaseBase — pass/warn/fail', () => {
  /**
   * Build a mock runGit that simulates:
   *   - origin/release/v0.13.2 exists
   *   - merge-base HEAD origin/release/v0.13.2 → forkSha
   *   - rev-list count → behindCount
   */
  function makeGit(forkSha: string, behindCount: number) {
    return (cmd: string, ...args: string[]): string => {
      if (cmd === 'rev-parse' && args.includes('--verify')) {
        // remote ref exists
        return 'abcdef1234567890\n'
      }
      if (cmd === 'merge-base') return `${forkSha}\n`
      if (cmd === 'rev-list' && args.includes('--count'))
        return `${behindCount}\n`
      return ''
    }
  }

  it('returns pass when baseAhead is 0', async () => {
    const result = await checkRebaseBase({
      runGit: makeGit('88e0a5e3cd72e9994ea47c53d746b18228a8d14b', 0),
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'feat/anv-0144',
    })
    expect(result.status).toBe('pass')
    expect(result.baseAhead).toBe(0)
    expect(result.forkPoint).toBe('88e0a5e3cd72e9994ea47c53d746b18228a8d14b')
  })

  it('returns warn when baseAhead > 0 (default mode)', async () => {
    const result = await checkRebaseBase({
      runGit: makeGit('aabbcc1122334455', 3),
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'feat/stale-branch',
    })
    expect(result.status).toBe('warn')
    expect(result.baseAhead).toBe(3)
    expect(result.reason).toContain('3 commit(s) behind')
  })

  it('returns fail when baseAhead > 0 and strict=true', async () => {
    const result = await checkRebaseBase({
      runGit: makeGit('aabbcc1122334455', 1),
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'feat/stale-branch',
      strict: true,
    })
    expect(result.status).toBe('fail')
    expect(result.baseAhead).toBe(1)
  })

  it('includes rebase hint in warn message', async () => {
    const result = await checkRebaseBase({
      runGit: makeGit('aabbcc1122334455', 2),
      releaseBranch: 'release/v0.13.2',
      currentBranch: 'feat/my-feature',
    })
    expect(result.reason).toContain('git fetch && git rebase')
    expect(result.reason).toContain('release/v0.13.2')
  })
})

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

describe('output formatting', () => {
  const samplePass: RebaseBaseResult = {
    status: 'pass',
    baseAhead: 0,
    forkPoint: '88e0a5e3cd72e9994ea47c53d746b18228a8d14b',
    releaseBranch: 'release/v0.13.2',
    reason:
      'branch feat/x is up to date with release/v0.13.2 (fork point 88e0a5e3)',
  }

  const sampleWarn: RebaseBaseResult = {
    status: 'warn',
    baseAhead: 2,
    forkPoint: 'aabbccdd11223344',
    releaseBranch: 'release/v0.13.2',
    reason:
      'branch feat/x is 2 commit(s) behind release/v0.13.2 (last fetched aabbccdd)',
  }

  it('formatPlainText includes status in uppercase', () => {
    expect(formatPlainText(samplePass)).toContain('PASS')
  })

  it('formatPlainText includes the reason', () => {
    expect(formatPlainText(samplePass)).toContain('up to date')
  })

  it('formatPlainText starts with "worktree base freshness:"', () => {
    expect(formatPlainText(sampleWarn)).toMatch(/^worktree base freshness:/)
  })

  it('formatJson produces valid JSON with all required fields', () => {
    const json = formatJson(samplePass)
    const parsed = JSON.parse(json) as RebaseBaseResult
    expect(parsed.status).toBe('pass')
    expect(parsed.baseAhead).toBe(0)
    expect(parsed.releaseBranch).toBe('release/v0.13.2')
    expect(typeof parsed.forkPoint).toBe('string')
    expect(typeof parsed.reason).toBe('string')
  })

  it('formatJson warn contains baseAhead > 0', () => {
    const json = formatJson(sampleWarn)
    const parsed = JSON.parse(json) as RebaseBaseResult
    expect(parsed.status).toBe('warn')
    expect(parsed.baseAhead).toBe(2)
  })
})
