import { describe, expect, it } from 'vitest'
import {
  computeSkillProvenanceFreshness,
  computeSkillVersionCoverage,
  computeSkillVersionRegressions,
} from '../../../../src/commands/cli/doctor.js'

/**
 * ANV-0058 review — unit tests for:
 *   1. computeSkillVersionCoverage  (Skill version coverage — warn row)
 *   2. computeSkillVersionRegressions (Skill version regression — fail row)
 *   3. computeSkillProvenanceFreshness (Skill provenance freshness — warn row)
 */

// ─── 1. computeSkillVersionCoverage ─────────────────────────────────────────

describe('computeSkillVersionCoverage', () => {
  it('returns 100% coverage when all skills have version', () => {
    const skills = [
      { name: 'a', version: '1.0.0' },
      { name: 'b', version: '2.3.1' },
    ]
    const { missing, total, coverage } = computeSkillVersionCoverage(skills)
    expect(missing).toHaveLength(0)
    expect(total).toBe(2)
    expect(coverage).toBe(1)
  })

  it('lists skills missing version', () => {
    const skills = [
      { name: 'a', version: '1.0.0' },
      { name: 'b' },
      { name: 'c' },
    ]
    const { missing, total, coverage } = computeSkillVersionCoverage(skills)
    expect(missing).toEqual(['b', 'c'])
    expect(total).toBe(3)
    expect(coverage).toBeCloseTo(1 / 3)
  })

  it('handles empty skill list — coverage is 1 (vacuously all covered)', () => {
    const { missing, total, coverage } = computeSkillVersionCoverage([])
    expect(missing).toHaveLength(0)
    expect(total).toBe(0)
    expect(coverage).toBe(1)
  })

  it('handles all skills missing version', () => {
    const skills = [{ name: 'x' }, { name: 'y' }]
    const { missing, coverage } = computeSkillVersionCoverage(skills)
    expect(missing).toEqual(['x', 'y'])
    expect(coverage).toBe(0)
  })
})

// ─── 2. computeSkillVersionRegressions ──────────────────────────────────────

describe('computeSkillVersionRegressions', () => {
  it('returns empty array when no regressions', () => {
    const skills = [
      { name: 'a', currentVersion: '1.1.0', priorVersion: '1.0.0' },
      { name: 'b', currentVersion: '2.0.0', priorVersion: '2.0.0' },
    ]
    expect(computeSkillVersionRegressions(skills)).toHaveLength(0)
  })

  it('detects a regression when current < prior', () => {
    const skills = [
      { name: 'a', currentVersion: '0.9.0', priorVersion: '1.0.0' },
    ]
    const regressions = computeSkillVersionRegressions(skills)
    expect(regressions).toHaveLength(1)
    expect(regressions[0]!.name).toBe('a')
    expect(regressions[0]!.current).toBe('0.9.0')
    expect(regressions[0]!.prior).toBe('1.0.0')
  })

  it('detects minor-version regression', () => {
    const skills = [
      { name: 'skill', currentVersion: '1.1.0', priorVersion: '1.2.0' },
    ]
    const regressions = computeSkillVersionRegressions(skills)
    expect(regressions).toHaveLength(1)
  })

  it('detects patch-version regression', () => {
    const skills = [
      { name: 'skill', currentVersion: '1.0.0', priorVersion: '1.0.1' },
    ]
    const regressions = computeSkillVersionRegressions(skills)
    expect(regressions).toHaveLength(1)
  })

  it('skips skills without currentVersion', () => {
    const skills = [{ name: 'a', priorVersion: '1.0.0' }]
    expect(computeSkillVersionRegressions(skills)).toHaveLength(0)
  })

  it('skips skills without priorVersion (new file)', () => {
    const skills = [{ name: 'a', currentVersion: '1.0.0' }]
    expect(computeSkillVersionRegressions(skills)).toHaveLength(0)
  })

  it('does not flag equal versions as regression', () => {
    const skills = [
      { name: 'a', currentVersion: '1.0.0', priorVersion: '1.0.0' },
    ]
    expect(computeSkillVersionRegressions(skills)).toHaveLength(0)
  })

  it('collects multiple regressions', () => {
    const skills = [
      { name: 'a', currentVersion: '0.0.1', priorVersion: '1.0.0' },
      { name: 'b', currentVersion: '1.0.0', priorVersion: '2.0.0' },
      { name: 'c', currentVersion: '1.5.0', priorVersion: '1.4.0' }, // no regression
    ]
    const regressions = computeSkillVersionRegressions(skills)
    expect(regressions).toHaveLength(2)
    expect(regressions.map((r) => r.name)).toEqual(['a', 'b'])
  })
})

// ─── 3. computeSkillProvenanceFreshness ─────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const NOW = Date.now()
const RECENT = NOW - 1 * 24 * 60 * 60 * 1000 // 1 day ago
const OLD = NOW - 60 * 24 * 60 * 60 * 1000 // 60 days ago

describe('computeSkillProvenanceFreshness', () => {
  it('returns empty when all recently modified skills have provenance', () => {
    const skills = [
      { name: 'a', hasProvenance: true, lastModifiedMs: RECENT },
      { name: 'b', hasProvenance: true, lastModifiedMs: RECENT },
    ]
    expect(computeSkillProvenanceFreshness(skills, NOW)).toHaveLength(0)
  })

  it('flags a recently modified skill missing provenance', () => {
    const skills = [
      { name: 'new-skill', hasProvenance: false, lastModifiedMs: RECENT },
    ]
    const stale = computeSkillProvenanceFreshness(skills, NOW)
    expect(stale).toEqual(['new-skill'])
  })

  it('does not flag old skills missing provenance (> 30 days ago)', () => {
    const skills = [
      { name: 'old-skill', hasProvenance: false, lastModifiedMs: OLD },
    ]
    expect(computeSkillProvenanceFreshness(skills, NOW)).toHaveLength(0)
  })

  it('handles mixed: flags recent-missing, ignores old-missing and recent-present', () => {
    const skills = [
      { name: 'recent-no-prov', hasProvenance: false, lastModifiedMs: RECENT },
      { name: 'recent-with-prov', hasProvenance: true, lastModifiedMs: RECENT },
      { name: 'old-no-prov', hasProvenance: false, lastModifiedMs: OLD },
    ]
    const stale = computeSkillProvenanceFreshness(skills, NOW)
    expect(stale).toEqual(['recent-no-prov'])
  })

  it('handles empty skill list', () => {
    expect(computeSkillProvenanceFreshness([], NOW)).toHaveLength(0)
  })

  it('uses injected now so the boundary is testable', () => {
    const fakeNow = 1_000_000_000_000
    const justInside = fakeNow - THIRTY_DAYS_MS + 1
    const justOutside = fakeNow - THIRTY_DAYS_MS - 1
    const skills = [
      { name: 'inside', hasProvenance: false, lastModifiedMs: justInside },
      { name: 'outside', hasProvenance: false, lastModifiedMs: justOutside },
    ]
    const stale = computeSkillProvenanceFreshness(skills, fakeNow)
    expect(stale).toEqual(['inside'])
  })
})
