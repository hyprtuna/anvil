/**
 * Tests for plan-verifier decision-coverage gate (Plan 36 Phase E).
 *
 * The plan-verifier checks that every D-NN: ID found in spec.md's
 * <decisions> block is represented in the plan's covered_decisions list.
 *
 * These tests verify the *parsing and matching logic* — the pure helper
 * functions that the agent calls. No live LLM.
 */

import { describe, expect, it } from 'vitest'
import {
  type DecisionCoverageResult,
  checkDecisionCoverage,
  extractCoveredDecisions,
  extractDecisionIds,
} from '../../../src/intent/decision-coverage.js'

// ── extractDecisionIds ─────────────────────────────────────────────────────

describe('extractDecisionIds', () => {
  it('extracts D-NN: IDs from a <decisions> block', () => {
    const spec = `
## Goal
Test feature

<decisions>
- D-01: chose tier-indirection over per-agent hard-coded model
- D-02: artifacts under .anvil/specs/features/<slug>/
- D-03: workflow.* booleans are per-gate
</decisions>
`
    expect(extractDecisionIds(spec)).toEqual(['D-01', 'D-02', 'D-03'])
  })

  it('returns empty array when no <decisions> block', () => {
    const spec = '## Goal\nTest\n'
    expect(extractDecisionIds(spec)).toEqual([])
  })

  it('returns empty array when <decisions> block is empty', () => {
    const spec = '<decisions>\n</decisions>\n'
    expect(extractDecisionIds(spec)).toEqual([])
  })

  it('extracts multi-digit IDs (D-10, D-42)', () => {
    const spec = '<decisions>\n- D-10: chose X\n- D-42: chose Y\n</decisions>\n'
    expect(extractDecisionIds(spec)).toEqual(['D-10', 'D-42'])
  })

  it('ignores IDs outside <decisions> block', () => {
    const spec = `
D-01: mentioned in prose

<decisions>
- D-02: actual decision
</decisions>
`
    // Only D-02 is inside the block
    expect(extractDecisionIds(spec)).toEqual(['D-02'])
  })

  it('handles decisions block with extra whitespace', () => {
    const spec =
      '<decisions>\n  - D-01: chose X  \n  - D-02: chose Y  \n</decisions>\n'
    expect(extractDecisionIds(spec)).toContain('D-01')
    expect(extractDecisionIds(spec)).toContain('D-02')
  })
})

// ── extractCoveredDecisions ────────────────────────────────────────────────

describe('extractCoveredDecisions', () => {
  it('extracts covered_decisions from YAML frontmatter', () => {
    const plan = `---
title: My Plan
feature_slug: my-feature
version: 1.0.0
covered_decisions:
  - D-01
  - D-02
---

# Plan body
`
    expect(extractCoveredDecisions(plan)).toEqual(['D-01', 'D-02'])
  })

  it('returns empty array when no covered_decisions in frontmatter', () => {
    const plan = '---\ntitle: My Plan\n---\n# Plan\n'
    expect(extractCoveredDecisions(plan)).toEqual([])
  })

  it('returns empty array when no frontmatter at all', () => {
    const plan = '# Plan\nSome plan content\n'
    expect(extractCoveredDecisions(plan)).toEqual([])
  })

  it('handles covered_decisions in must_haves.covered_decisions path', () => {
    const plan = `---
must_haves:
  covered_decisions:
    - D-01
    - D-03
---
# Plan
`
    const result = extractCoveredDecisions(plan)
    // Should find covered_decisions somewhere in frontmatter
    expect(result).toContain('D-01')
    expect(result).toContain('D-03')
  })
})

// ── checkDecisionCoverage ──────────────────────────────────────────────────

describe('checkDecisionCoverage', () => {
  const FIXTURE_SPEC = `
## Goal
Test feature

<decisions>
- D-01: chose tier-indirection
- D-02: artifacts location
- D-03: workflow booleans
</decisions>
`

  it('BLOCKER when plan covers only subset (D-01 only)', () => {
    const plan = `---
covered_decisions:
  - D-01
---
# Plan
`
    const result: DecisionCoverageResult = checkDecisionCoverage(
      FIXTURE_SPEC,
      plan,
    )
    expect(result.passed).toBe(false)
    expect(result.missing).toContain('D-02')
    expect(result.missing).toContain('D-03')
    expect(result.missing).not.toContain('D-01')
  })

  it('PASS when all three decisions are covered', () => {
    const plan = `---
covered_decisions:
  - D-01
  - D-02
  - D-03
---
# Plan
`
    const result: DecisionCoverageResult = checkDecisionCoverage(
      FIXTURE_SPEC,
      plan,
    )
    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('PASS when plan has no decisions and spec has no decisions', () => {
    const noDecisionsSpec = '## Goal\nTest\n'
    const plan = '# Plan\nNo decisions needed\n'
    const result = checkDecisionCoverage(noDecisionsSpec, plan)
    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })

  it('BLOCKER when spec has decisions and plan has no covered_decisions', () => {
    const plan = '# Plan\nNo YAML frontmatter\n'
    const result = checkDecisionCoverage(FIXTURE_SPEC, plan)
    expect(result.passed).toBe(false)
    expect(result.missing).toEqual(
      expect.arrayContaining(['D-01', 'D-02', 'D-03']),
    )
  })

  it('lists specific missing IDs in BLOCKER message', () => {
    const plan = `---
covered_decisions:
  - D-01
---
# Plan
`
    const result = checkDecisionCoverage(FIXTURE_SPEC, plan)
    expect(result.passed).toBe(false)
    // The result should identify exactly what's missing
    expect(result.missing.sort()).toEqual(['D-02', 'D-03'])
  })

  it('PASS when covered_decisions is a superset of spec decisions', () => {
    const plan = `---
covered_decisions:
  - D-01
  - D-02
  - D-03
  - D-99
---
# Plan
`
    const result = checkDecisionCoverage(FIXTURE_SPEC, plan)
    expect(result.passed).toBe(true)
    expect(result.missing).toHaveLength(0)
  })
})
