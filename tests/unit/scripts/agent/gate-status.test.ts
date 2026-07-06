import { describe, expect, it } from 'vitest'
import {
  type GateStatus,
  type GateStatusDeps,
  getGateStatus,
} from '../../../../scripts/agent/gate-status.js'

function makeDeps(
  stdout: string,
  exitCode: number,
  overrides: Partial<GateStatusDeps> = {},
): GateStatusDeps {
  return {
    now: () => Date.now(),
    runGate: async () => ({ stdout, exitCode }),
    ...overrides,
  }
}

const PASS_OUTPUT = `
Checked 737 files in 177ms. No fixes applied.
worktree base freshness: SKIP — release branch not found

 ✓ tests/unit/example.test.ts  (10 tests) 50ms

 Test Files  10 passed (10)
      Tests  4784 passed | 10 skipped (4794)
   Start at  12:00:00
   Duration  40s

gate: lint ✓  base ✓  typecheck ✓  tests 4784/4794 ✓
`

const FAIL_LINT_OUTPUT = `
gate: lint ✗
`

describe('getGateStatus', () => {
  it('returns overall pass on exit 0', async () => {
    const result = await getGateStatus(makeDeps(PASS_OUTPUT, 0))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const g = result as GateStatus
    expect(g.overall).toBe('pass')
    expect(g.lint).toBe('pass')
    expect(g.typecheck).toBe('pass')
    expect(g.rebaseBase).toBe('pass')
    expect(g.tests.pass).toBe(4784)
    expect(g.tests.fail).toBe(0)
  })

  it('returns overall fail on non-zero exit', async () => {
    const result = await getGateStatus(makeDeps(FAIL_LINT_OUTPUT, 1))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result as GateStatus).overall).toBe('fail')
    expect((result as GateStatus).lint).toBe('fail')
  })

  it('returns ok: false when runGate throws', async () => {
    const deps: GateStatusDeps = {
      now: () => 0,
      runGate: async () => {
        throw new Error('spawn failed')
      },
    }
    const result = await getGateStatus(deps)
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain(
      'spawn failed',
    )
  })

  it('returns durationMs as a non-negative number', async () => {
    let t = 0
    const result = await getGateStatus(
      makeDeps(PASS_OUTPUT, 0, {
        now: () => {
          t += 100
          return t
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result as GateStatus).durationMs).toBeGreaterThanOrEqual(0)
  })

  it('reports skip for missing phases', async () => {
    const result = await getGateStatus(makeDeps('gate: lint ✓', 0))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const g = result as GateStatus
    expect(g.typecheck).toBe('skip')
    expect(g.rebaseBase).toBe('skip')
  })
})
