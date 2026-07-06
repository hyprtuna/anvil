import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { phaseBoundaryHandler } from '../../../../src/hooks/handlers/phase-boundary.js'

function makeCtx(payload: unknown) {
  return {
    kind: 'phase-boundary' as const,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

describe('hooks/handlers/phase-boundary', () => {
  it('returns OK for non-protected paths', async () => {
    const r = await phaseBoundaryHandler(
      makeCtx({
        filePath: 'src/utils/helper.ts',
        content: 'export function helper() {}',
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('not a protected path')
  })

  it('returns warning for plan file edits', async () => {
    // ANV-0131: plans moved to .anvil/_archive/docs-anvil/plans/
    const r = await phaseBoundaryHandler(
      makeCtx({
        filePath:
          '.anvil/_archive/docs-anvil/plans/2026-04-13-01-repo-bootstrap.md',
      }),
    )
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('WARNING')
    expect(r.message).toContain('planning artifact')
    expect(r.context).toMatchObject({ severity: 'warning' })
  })

  it('returns warning for .anvil/state/ edits', async () => {
    const r = await phaseBoundaryHandler(
      makeCtx({
        filePath: '.anvil/state/active-workflow.json',
      }),
    )
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('WARNING')
  })

  it('returns warning for SPEC.md edits', async () => {
    const r = await phaseBoundaryHandler(
      makeCtx({
        filePath: 'SPEC.md',
      }),
    )
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('WARNING')
  })

  it('returns warning for ARCHITECTURE.md edits', async () => {
    const r = await phaseBoundaryHandler(
      makeCtx({
        filePath: 'ARCHITECTURE.md',
      }),
    )
    expect(r.exitCode).toBe(1)
  })

  it('returns warning for PLAN.md edits', async () => {
    const r = await phaseBoundaryHandler(
      makeCtx({
        filePath: 'PLAN.md',
      }),
    )
    expect(r.exitCode).toBe(1)
  })

  it('handles null payload gracefully', async () => {
    const r = await phaseBoundaryHandler(makeCtx(null))
    expect(r.exitCode).toBe(0)
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/phase-boundary — HookResult shape', () => {
  it('non-protected path passes HookResult.parse()', async () => {
    const r = await phaseBoundaryHandler(
      makeCtx({ filePath: 'src/utils/helper.ts' }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('protected path passes HookResult.parse()', async () => {
    // ANV-0131: plans moved to .anvil/_archive/docs-anvil/plans/
    const r = await phaseBoundaryHandler(
      makeCtx({ filePath: '.anvil/_archive/docs-anvil/plans/test.md' }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('null payload passes HookResult.parse()', async () => {
    const r = await phaseBoundaryHandler(makeCtx(null))
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
