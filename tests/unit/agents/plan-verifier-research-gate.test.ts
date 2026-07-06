/**
 * Tests for plan-verifier research gate (Plan 36 Phase E).
 *
 * The research gate checks whether spec.md's ## Open Questions section
 * is empty (allows proceeding) or non-empty (BLOCKER).
 *
 * These tests verify the pure parsing and gate logic — no live LLM.
 */

import { describe, expect, it } from 'vitest'
import {
  type ResearchGateResult,
  checkResearchGate,
  extractOpenQuestions,
} from '../../../src/intent/research-gate.js'

// ── extractOpenQuestions ────────────────────────────────────────────────────

describe('extractOpenQuestions', () => {
  it('extracts non-empty bullet items from ## Open Questions', () => {
    const spec = `
## Goal
Feature goal

## Open Questions
- What about performance?
- How does backcompat work?
- Is this approach safe?

## Acceptance
Done when X
`
    const result = extractOpenQuestions(spec)
    expect(result.items).toHaveLength(3)
    expect(result.items).toContain('What about performance?')
    expect(result.items).toContain('How does backcompat work?')
  })

  it('returns empty items for - (none) marker', () => {
    const spec = `
## Open Questions
- (none)
`
    const result = extractOpenQuestions(spec)
    expect(result.items).toHaveLength(0)
    expect(result.hasSection).toBe(true)
  })

  it('returns empty items for empty section (no bullets)', () => {
    const spec = `
## Open Questions

## Acceptance
Done when X
`
    const result = extractOpenQuestions(spec)
    expect(result.items).toHaveLength(0)
    expect(result.hasSection).toBe(true)
  })

  it('reports hasSection=false when ## Open Questions is absent', () => {
    const spec = '## Goal\nTest\n## Acceptance\nDone\n'
    const result = extractOpenQuestions(spec)
    expect(result.hasSection).toBe(false)
    expect(result.items).toHaveLength(0)
  })

  it('handles single-item list', () => {
    const spec = '## Open Questions\n- One lingering concern\n'
    const result = extractOpenQuestions(spec)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toContain('lingering concern')
  })

  it('treats "- (none)" as cleared regardless of case', () => {
    const spec = '## Open Questions\n- (None)\n'
    const result = extractOpenQuestions(spec)
    expect(result.items).toHaveLength(0)
  })

  it('ignores empty bullet lines', () => {
    const spec = '## Open Questions\n- \n- actual question\n'
    const result = extractOpenQuestions(spec)
    // Empty bullet should be filtered
    expect(result.items.filter((i) => i.length > 0)).toHaveLength(1)
  })
})

// ── checkResearchGate ───────────────────────────────────────────────────────

describe('checkResearchGate', () => {
  it('BLOCKER when spec has non-empty Open Questions', () => {
    const spec = `
## Open Questions
- What about performance implications?
- Does this break backward compatibility?
`
    const result: ResearchGateResult = checkResearchGate(spec)
    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(2)
    expect(result.blockers[0]).toContain('performance')
  })

  it('PASS when Open Questions is - (none)', () => {
    const spec = `
## Goal
Feature

## Open Questions
- (none)

## Acceptance
Done
`
    const result: ResearchGateResult = checkResearchGate(spec)
    expect(result.passed).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('PASS when Open Questions section is empty (no bullets)', () => {
    const spec = `
## Open Questions

## Next Section
Content
`
    const result: ResearchGateResult = checkResearchGate(spec)
    expect(result.passed).toBe(true)
    expect(result.blockers).toHaveLength(0)
  })

  it('BLOCKER when ## Open Questions section is absent entirely', () => {
    // Phase D requirement: Open Questions MUST be present in spec.md
    // Even empty, the section header is required.
    const spec = `
## Goal
Test

## Scope
In scope

## Acceptance
Done
`
    const result: ResearchGateResult = checkResearchGate(spec)
    expect(result.passed).toBe(false)
    expect(result.blockers.length).toBeGreaterThan(0)
    // Should mention that the section is missing
    expect(result.blockers.join(' ')).toMatch(/open questions|missing/i)
  })

  it('lists each unresolved item in blockers', () => {
    const spec = `
## Open Questions
- Question one
- Question two
- Question three
`
    const result: ResearchGateResult = checkResearchGate(spec)
    expect(result.passed).toBe(false)
    expect(result.blockers).toHaveLength(3)
  })

  it('PASS when all questions resolved (none marker)', () => {
    const spec = '## Open Questions\n- (none)\n'
    const result = checkResearchGate(spec)
    expect(result.passed).toBe(true)
  })
})
