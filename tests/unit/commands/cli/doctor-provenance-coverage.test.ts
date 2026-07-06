import { describe, expect, it } from 'vitest'
import { computeProvenanceCoverage } from '../../../../src/commands/cli/doctor.js'

/**
 * Plan 44 Phase D — `Skill provenance coverage` doctor row.
 *
 * Pure function under test: given a list of skills (with sourceProvenance),
 * compute the coverage ratio and severity. Warn-only at <80%; never fails.
 */

type Row = { name: string; sourceProvenance?: string }

describe('computeProvenanceCoverage (Plan 44 Phase D)', () => {
  it('returns pass when every skill declares a non-unknown source', () => {
    const rows: Row[] = [
      { name: 'a', sourceProvenance: 'authored' },
      { name: 'b', sourceProvenance: 'distilled' },
      { name: 'c', sourceProvenance: 'imported' },
    ]
    const r = computeProvenanceCoverage(rows)
    expect(r.status).toBe('pass')
    expect(r.coverage).toBe(1.0)
    expect(r.declared).toBe(3)
    expect(r.total).toBe(3)
  })

  it('returns pass at exactly the 80% threshold', () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, i) => ({
      name: `s${i}`,
      sourceProvenance: i < 8 ? 'authored' : 'unknown',
    }))
    const r = computeProvenanceCoverage(rows)
    expect(r.status).toBe('pass')
    expect(r.coverage).toBeCloseTo(0.8, 5)
  })

  it('returns warn (not fail) below 80% coverage', () => {
    const rows: Row[] = Array.from({ length: 10 }, (_, i) => ({
      name: `s${i}`,
      sourceProvenance: i < 5 ? 'authored' : 'unknown',
    }))
    const r = computeProvenanceCoverage(rows)
    expect(r.status).toBe('warn')
    expect(r.coverage).toBe(0.5)
  })

  it('returns skip when no skills are present', () => {
    const r = computeProvenanceCoverage([])
    expect(r.status).toBe('skip')
  })
})
