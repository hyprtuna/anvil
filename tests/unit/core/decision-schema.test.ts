import { describe, expect, it } from 'vitest'
import {
  Decision,
  DecisionCoverageReport,
  DecisionsBlock,
} from '../../../src/core/types.js'

describe('Decision Zod schema', () => {
  const valid = {
    id: 'D-001',
    title: 'Use Zod for boundary validation',
    rationale: 'Consistent with existing types.ts conventions.',
  }

  it('parses a valid Decision', () => {
    const d = Decision.parse(valid)
    expect(d.id).toBe('D-001')
    expect(d.title).toBe('Use Zod for boundary validation')
    expect(d.rationale).toBe('Consistent with existing types.ts conventions.')
  })

  it('rejects a Decision with empty id', () => {
    expect(() => Decision.parse({ ...valid, id: '' })).toThrow()
  })

  it('rejects a Decision with empty title', () => {
    expect(() => Decision.parse({ ...valid, title: '' })).toThrow()
  })

  it('rejects a Decision with empty rationale', () => {
    expect(() => Decision.parse({ ...valid, rationale: '' })).toThrow()
  })

  it('rejects a Decision missing id', () => {
    const { id: _id, ...rest } = valid
    expect(() => Decision.parse(rest)).toThrow()
  })

  it('rejects a Decision missing title', () => {
    const { title: _t, ...rest } = valid
    expect(() => Decision.parse(rest)).toThrow()
  })

  it('rejects a Decision missing rationale', () => {
    const { rationale: _r, ...rest } = valid
    expect(() => Decision.parse(rest)).toThrow()
  })
})

describe('DecisionsBlock Zod schema', () => {
  it('parses a valid DecisionsBlock', () => {
    const block = DecisionsBlock.parse({
      source_path:
        '.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md',
      decisions: [
        {
          id: 'D-001',
          title: 'Use Zod',
          rationale: 'Type safety at boundaries.',
        },
      ],
    })
    expect(block.source_path).toContain('v0.6.0')
    expect(block.decisions).toHaveLength(1)
  })

  it('applies default empty array for decisions', () => {
    const block = DecisionsBlock.parse({ source_path: 'docs/plan.md' })
    expect(block.decisions).toEqual([])
  })

  it('rejects a DecisionsBlock with empty source_path', () => {
    expect(() => DecisionsBlock.parse({ source_path: '' })).toThrow()
  })

  it('rejects a DecisionsBlock missing source_path', () => {
    expect(() => DecisionsBlock.parse({})).toThrow()
  })

  it('rejects a DecisionsBlock with malformed decision inside', () => {
    expect(() =>
      DecisionsBlock.parse({
        source_path: 'docs/plan.md',
        decisions: [{ id: '', title: 'x', rationale: 'y' }],
      }),
    ).toThrow()
  })
})

describe('DecisionCoverageReport Zod schema', () => {
  const validReport = {
    source_path: '.anvil/_archive/docs-anvil/plans/plan.md',
    total: 3,
    covered_ids: ['D-001', 'D-002'],
    uncovered_ids: ['D-003'],
    passed: false,
  }

  it('parses a valid DecisionCoverageReport', () => {
    const r = DecisionCoverageReport.parse(validReport)
    expect(r.total).toBe(3)
    expect(r.covered_ids).toHaveLength(2)
    expect(r.uncovered_ids).toHaveLength(1)
    expect(r.passed).toBe(false)
  })

  it('parses a passing report with empty uncovered_ids', () => {
    const r = DecisionCoverageReport.parse({
      source_path: 'docs/plan.md',
      total: 2,
      covered_ids: ['D-001', 'D-002'],
      uncovered_ids: [],
      passed: true,
    })
    expect(r.passed).toBe(true)
  })

  it('applies defaults for covered_ids and uncovered_ids', () => {
    const r = DecisionCoverageReport.parse({
      source_path: 'docs/plan.md',
      total: 0,
      passed: true,
    })
    expect(r.covered_ids).toEqual([])
    expect(r.uncovered_ids).toEqual([])
  })

  it('rejects a negative total', () => {
    expect(() =>
      DecisionCoverageReport.parse({ ...validReport, total: -1 }),
    ).toThrow()
  })

  it('rejects a non-integer total', () => {
    expect(() =>
      DecisionCoverageReport.parse({ ...validReport, total: 1.5 }),
    ).toThrow()
  })

  it('rejects empty source_path', () => {
    expect(() =>
      DecisionCoverageReport.parse({ ...validReport, source_path: '' }),
    ).toThrow()
  })

  it('rejects missing source_path', () => {
    const { source_path: _s, ...rest } = validReport
    expect(() => DecisionCoverageReport.parse(rest)).toThrow()
  })
})
