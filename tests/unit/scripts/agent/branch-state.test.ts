import { describe, expect, it } from 'vitest'
import {
  type BranchState,
  getBranchState,
} from '../../../../scripts/agent/branch-state.js'

// Minimal DI stub for a clean branch on main
function makeRunGit(
  overrides: Record<string, string> = {},
): (...args: string[]) => string {
  return (...args: string[]) => {
    const key = args.join(' ')
    if (key in overrides) return overrides[key] as string
    // Default responses
    if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref')
      return 'feat/test-branch'
    if (args[0] === 'rev-list' && args[1] === '--count') return '0\t3'
    if (args[0] === 'status') return ''
    if (args[0] === 'rev-parse' && args[1] === '--short') return 'abc1234'
    if (args[0] === 'log') return 'feat: add something'
    throw new Error(`unexpected git ${args.join(' ')}`)
  }
}

describe('getBranchState', () => {
  it('returns ok: true with correct shape on clean branch', () => {
    const result = getBranchState(makeRunGit())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const state = result as BranchState
    expect(state.branch).toBe('feat/test-branch')
    expect(typeof state.base).toBe('string')
    expect(typeof state.ahead).toBe('number')
    expect(typeof state.behind).toBe('number')
    expect(state.dirty).toBe(false)
    expect(state.untracked).toBe(false)
    expect(state.lastCommitSha).toBe('abc1234')
    expect(state.lastCommitSubject).toBe('feat: add something')
  })

  it('reports dirty = true when porcelain shows modified files', () => {
    const result = getBranchState(
      makeRunGit({ 'status --porcelain=v1': ' M src/foo.ts' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result as BranchState).dirty).toBe(true)
    expect((result as BranchState).untracked).toBe(false)
  })

  it('reports untracked = true when porcelain shows ?? files', () => {
    const result = getBranchState(
      makeRunGit({ 'status --porcelain=v1': '?? newfile.ts' }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result as BranchState).untracked).toBe(true)
  })

  it('returns ok: false when rev-parse fails', () => {
    const bad = (): never => {
      throw new Error('not a git repo')
    }
    const result = getBranchState(bad)
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain(
      'not a git repo',
    )
  })

  it('parses ahead/behind correctly', () => {
    // Pin the release branch via env so the mock key is version-independent.
    // Without this, deriveReleaseBranch reads package.json and derives
    // "release/v<version+1>", which drifts as the project version bumps.
    const origBranch = process.env.ANVIL_RELEASE_BRANCH
    process.env.ANVIL_RELEASE_BRANCH = 'release/v0.13.4'

    let result: BranchState | { ok: false; error: string }
    try {
      result = getBranchState(
        makeRunGit({
          'rev-list --count --left-right release/v0.13.4...HEAD': '5\t2',
        }),
      )
    } finally {
      if (origBranch !== undefined) {
        process.env.ANVIL_RELEASE_BRANCH = origBranch
      } else {
        // biome-ignore lint/performance/noDelete: must faithfully restore absent-key state
        delete process.env.ANVIL_RELEASE_BRANCH
      }
    }

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const state = result as BranchState
    // behind=5, ahead=2
    expect(state.behind).toBe(5)
    expect(state.ahead).toBe(2)
  })
})
