/**
 * ANV-0153 — Unit tests for gate.ts formatGateSummary.
 *
 * Tests the pure formatter function in isolation — no process spawning,
 * no filesystem access. All phase runners are excluded from this test.
 */
import { describe, expect, it } from 'vitest'
import {
  type PhaseResult,
  formatGateSummary,
  parseVitestCounts,
} from '../../../scripts/ci/gate.js'

describe('formatGateSummary', () => {
  it('all four phases pass with test counts → exact summary string', () => {
    const results: PhaseResult[] = [
      { name: 'lint', ok: true },
      { name: 'base', ok: true },
      { name: 'typecheck', ok: true },
      { name: 'tests', ok: true, testCounts: { passed: 4765, total: 4775 } },
    ]
    expect(formatGateSummary(results)).toBe(
      'gate: lint ✓  base ✓  typecheck ✓  tests 4765/4775 ✓',
    )
  })

  it('all four pass but vitest parse failed → tests ✓ (no counts)', () => {
    const results: PhaseResult[] = [
      { name: 'lint', ok: true },
      { name: 'base', ok: true },
      { name: 'typecheck', ok: true },
      { name: 'tests', ok: true },
      // testCounts absent — parse failure fallback
    ]
    expect(formatGateSummary(results)).toBe(
      'gate: lint ✓  base ✓  typecheck ✓  tests ✓',
    )
  })

  it('lint fails fast → gate: lint ✗ (no other phases mentioned)', () => {
    const results: PhaseResult[] = [{ name: 'lint', ok: false }]
    expect(formatGateSummary(results)).toBe('gate: lint ✗')
  })

  it('lint passes, base fails → gate: lint ✓  base ✗', () => {
    const results: PhaseResult[] = [
      { name: 'lint', ok: true },
      { name: 'base', ok: false },
    ]
    expect(formatGateSummary(results)).toBe('gate: lint ✓  base ✗')
  })

  it('test counts with failures present → uses passed/total numbers', () => {
    // tests phase failed but we still got counts (e.g. 100/120 passed)
    const results: PhaseResult[] = [
      { name: 'lint', ok: true },
      { name: 'base', ok: true },
      { name: 'typecheck', ok: true },
      { name: 'tests', ok: false, testCounts: { passed: 100, total: 120 } },
    ]
    // Even when ok=false, counts are displayed alongside the ✗ mark so the
    // developer can see how many tests passed before the run aborted.
    expect(formatGateSummary(results)).toBe(
      'gate: lint ✓  base ✓  typecheck ✓  tests 100/120 ✗',
    )
  })

  it('typecheck fails → gate: lint ✓  base ✓  typecheck ✗', () => {
    const results: PhaseResult[] = [
      { name: 'lint', ok: true },
      { name: 'base', ok: true },
      { name: 'typecheck', ok: false },
    ]
    expect(formatGateSummary(results)).toBe('gate: lint ✓  base ✓  typecheck ✗')
  })
})

describe('parseVitestCounts', () => {
  it('vitest v1 output with skipped suffix → passed and total', () => {
    expect(parseVitestCounts('Tests  4784 passed | 10 skipped (4794)')).toEqual(
      { passed: 4784, total: 4794 },
    )
  })

  it('plain passing output without suffix → passed and total', () => {
    expect(parseVitestCounts('Tests  4794 passed (4794)')).toEqual({
      passed: 4794,
      total: 4794,
    })
  })

  it('output with failed prefix before passed → anchors on passed', () => {
    expect(
      parseVitestCounts('Tests  3 failed | 4781 passed | 10 skipped (4794)'),
    ).toEqual({ passed: 4781, total: 4794 })
  })

  it('no test summary line → undefined', () => {
    expect(parseVitestCounts('no test summary here')).toBeUndefined()
  })

  it('empty string → undefined', () => {
    expect(parseVitestCounts('')).toBeUndefined()
  })
})
