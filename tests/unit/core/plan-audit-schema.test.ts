import { describe, expect, it } from 'vitest'
import {
  PlanAuditReport,
  PlanGap,
  PlanGapKind,
} from '../../../src/core/types.js'

describe('PlanAuditReport Zod schema', () => {
  const validGap = {
    kind: 'missing-requirement' as const,
    severity: 'critical' as const,
    message: 'No task covers the error-handling requirement.',
    task_ref: 'Task 3',
    spec_ref: 'docs/spec.md#error-handling',
  }

  it('parses a valid passing PlanAuditReport with no gaps', () => {
    const report = PlanAuditReport.parse({
      verdict: 'pass',
      plan_path:
        '.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md',
      requirements_total: 10,
      requirements_covered: 10,
    })

    expect(report.verdict).toBe('pass')
    expect(report.gaps).toEqual([])
    expect(report.spec_path).toBeUndefined()
  })

  it('parses a failing report with gaps', () => {
    const report = PlanAuditReport.parse({
      verdict: 'fail',
      plan_path:
        '.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md',
      spec_path:
        '.anvil/_archive/docs-anvil/specs/2026-04-24-deep-upgrade-master.md',
      gaps: [validGap],
      requirements_total: 10,
      requirements_covered: 9,
    })

    expect(report.verdict).toBe('fail')
    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0]?.kind).toBe('missing-requirement')
    expect(report.gaps[0]?.severity).toBe('critical')
    expect(report.requirements_covered).toBe(9)
  })

  it('applies default empty gaps array', () => {
    const report = PlanAuditReport.parse({
      verdict: 'pass',
      plan_path: 'docs/plan.md',
      requirements_total: 5,
      requirements_covered: 5,
    })
    expect(report.gaps).toEqual([])
  })

  it('rejects missing plan_path', () => {
    expect(() =>
      PlanAuditReport.parse({
        verdict: 'pass',
        requirements_total: 5,
        requirements_covered: 5,
      }),
    ).toThrow()
  })

  it('rejects empty plan_path', () => {
    expect(() =>
      PlanAuditReport.parse({
        verdict: 'pass',
        plan_path: '',
        requirements_total: 5,
        requirements_covered: 5,
      }),
    ).toThrow()
  })

  it('rejects invalid verdict', () => {
    expect(() =>
      PlanAuditReport.parse({
        verdict: 'warn',
        plan_path: 'docs/plan.md',
        requirements_total: 5,
        requirements_covered: 5,
      }),
    ).toThrow()
  })

  it('rejects negative requirements_total', () => {
    expect(() =>
      PlanAuditReport.parse({
        verdict: 'pass',
        plan_path: 'docs/plan.md',
        requirements_total: -1,
        requirements_covered: 0,
      }),
    ).toThrow()
  })

  it('rejects non-integer requirements_covered', () => {
    expect(() =>
      PlanAuditReport.parse({
        verdict: 'pass',
        plan_path: 'docs/plan.md',
        requirements_total: 5,
        requirements_covered: 4.5,
      }),
    ).toThrow()
  })

  it('parses all valid PlanGapKind values', () => {
    const kinds = [
      'missing-requirement',
      'scope-creep',
      'ambiguous-acceptance',
      'unmapped-task',
      'dependency-violation',
      'broken-reference',
      'hidden-intention',
      'missing-edge-case',
    ] as const

    for (const kind of kinds) {
      const gap = PlanGap.parse({
        kind,
        severity: 'suggestion',
        message: `Test gap for kind: ${kind}`,
      })
      expect(gap.kind).toBe(kind)
    }
  })

  it('rejects an invalid PlanGapKind', () => {
    expect(() =>
      PlanGap.parse({
        kind: 'typo-in-name',
        severity: 'critical',
        message: 'Something',
      }),
    ).toThrow()
  })

  it('rejects a gap with empty message', () => {
    expect(() =>
      PlanGap.parse({
        kind: 'broken-reference',
        severity: 'important',
        message: '',
      }),
    ).toThrow()
  })

  it('allows optional task_ref and spec_ref to be absent', () => {
    const gap = PlanGap.parse({
      kind: 'missing-edge-case',
      severity: 'suggestion',
      message: 'No test for empty input.',
    })
    expect(gap.task_ref).toBeUndefined()
    expect(gap.spec_ref).toBeUndefined()
  })

  it('PlanGapKind enum is exported and contains all expected values', () => {
    const values = PlanGapKind.options
    expect(values).toContain('missing-requirement')
    expect(values).toContain('scope-creep')
    expect(values).toContain('ambiguous-acceptance')
    expect(values).toContain('unmapped-task')
    expect(values).toContain('dependency-violation')
    expect(values).toContain('broken-reference')
    expect(values).toContain('hidden-intention')
    expect(values).toContain('missing-edge-case')
    expect(values).toHaveLength(8)
  })
})
