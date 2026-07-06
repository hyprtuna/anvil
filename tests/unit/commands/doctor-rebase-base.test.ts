/**
 * ANV-0144 — Unit tests for the doctor "Worktree base freshness" row.
 *
 * Tests the pushRebaseBaseFreshnessCheck function across all status variants:
 * pass, warn, fail, skip.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../src/core/rebase-guard/index.js', () => ({
  checkRebaseBase: vi.fn(),
  deriveReleaseBranch: vi.fn().mockReturnValue('release/v0.13.2'),
  formatPlainText: vi.fn(),
  formatJson: vi.fn(),
}))

import { pushRebaseBaseFreshnessCheck } from '../../../src/commands/cli/doctor.js'
// Import after mocks are established
import { checkRebaseBase } from '../../../src/core/rebase-guard/index.js'

const mockCheckRebaseBase = vi.mocked(checkRebaseBase)

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Check = {
  name: string
  status: string
  detail: string
  expectedAbsence?: boolean
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pushRebaseBaseFreshnessCheck', () => {
  it('emits pass row when baseAhead is 0', async () => {
    mockCheckRebaseBase.mockResolvedValue({
      status: 'pass',
      baseAhead: 0,
      forkPoint: '88e0a5e3cd72e9994ea47c53d746b18228a8d14b',
      releaseBranch: 'release/v0.13.2',
      reason:
        'branch feat/x is up to date with release/v0.13.2 (fork point 88e0a5e3)',
    })

    const checks: Check[] = []
    await pushRebaseBaseFreshnessCheck(checks, false)

    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Worktree base freshness')
    expect(checks[0].status).toBe('pass')
  })

  it('emits warn row when baseAhead > 0 (default mode)', async () => {
    mockCheckRebaseBase.mockResolvedValue({
      status: 'warn',
      baseAhead: 3,
      forkPoint: 'aabbccdd11223344',
      releaseBranch: 'release/v0.13.2',
      reason: 'branch feat/x is 3 commit(s) behind release/v0.13.2',
    })

    const checks: Check[] = []
    await pushRebaseBaseFreshnessCheck(checks, false)

    expect(checks[0].status).toBe('warn')
    expect(checks[0].detail).toContain('3 commit(s) behind')
  })

  it('emits fail row when baseAhead > 0 and strict=true', async () => {
    mockCheckRebaseBase.mockResolvedValue({
      status: 'fail',
      baseAhead: 1,
      forkPoint: 'aabbccdd11223344',
      releaseBranch: 'release/v0.13.2',
      reason: 'branch feat/x is 1 commit(s) behind release/v0.13.2',
    })

    const checks: Check[] = []
    await pushRebaseBaseFreshnessCheck(checks, true)

    expect(checks[0].status).toBe('fail')
  })

  it('emits skip row when on release branch', async () => {
    mockCheckRebaseBase.mockResolvedValue({
      status: 'skip',
      baseAhead: 0,
      forkPoint: '',
      releaseBranch: 'release/v0.13.2',
      reason: 'on release branch (release/v0.13.2) — no base check needed',
    })

    const checks: Check[] = []
    await pushRebaseBaseFreshnessCheck(checks, false)

    expect(checks[0].status).toBe('skip')
    expect(checks[0].expectedAbsence).toBe(true)
  })

  it('emits skip row with expectedAbsence when checkRebaseBase throws', async () => {
    mockCheckRebaseBase.mockRejectedValue(new Error('not a git repo'))

    const checks: Check[] = []
    await pushRebaseBaseFreshnessCheck(checks, false)

    expect(checks[0].status).toBe('skip')
    expect(checks[0].expectedAbsence).toBe(true)
  })

  it('row name is always "Worktree base freshness"', async () => {
    mockCheckRebaseBase.mockResolvedValue({
      status: 'pass',
      baseAhead: 0,
      forkPoint: 'abc',
      releaseBranch: 'release/v0.13.2',
      reason: 'up to date',
    })

    const checks: Check[] = []
    await pushRebaseBaseFreshnessCheck(checks, false)

    expect(checks[0].name).toBe('Worktree base freshness')
  })
})
