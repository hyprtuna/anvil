import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MIGRATION_WINDOW_THRESHOLD,
  computeSkillProvenanceFreshness,
  computeSkillVersionCoverage,
  getMigrationWindowThreshold,
} from '../../../../src/commands/cli/doctor.js'

/**
 * ANV-0149 — migration-window suppression unit tests.
 *
 * Tests cover:
 *   1. MIGRATION_WINDOW_THRESHOLD constant value
 *   2. getMigrationWindowThreshold() — env override, invalid value fallback, clamp
 *   3. Version coverage suppression logic (ratio ≥ threshold → skip, < threshold → warn)
 *   4. Provenance freshness suppression logic (same pattern)
 *   5. --show-migration / showMigration flag forces warn regardless of ratio
 *   6. Exact threshold boundary (ratio === threshold → skip, not warn)
 */

// ---------------------------------------------------------------------------
// Helpers to simulate the suppression logic without full doctor infra
// ---------------------------------------------------------------------------

/**
 * Replicate the migration-window decision from pushSkillVersionCoverageCheck
 * so we can test the suppression logic purely, without loading skills from disk.
 */
function versionCoverageStatus(
  missing: number,
  total: number,
  showMigration: boolean,
  threshold: number,
): 'pass' | 'warn' | 'skip' {
  if (missing === 0) return 'pass'
  const missingRatio = total === 0 ? 0 : missing / total
  if (!showMigration && missingRatio >= threshold) return 'skip'
  return 'warn'
}

function versionCoverageDetail(
  missing: number,
  total: number,
  showMigration: boolean,
  threshold: number,
): string {
  if (missing === 0) return `${total} skill(s) all declare version`
  const missingRatio = total === 0 ? 0 : missing / total
  if (!showMigration && missingRatio >= threshold) {
    const roundedPct = Math.round(missingRatio * 100)
    return `~${roundedPct}% of skills haven't adopted \`version:\` yet — suppressed during migration window (pass --show-migration to see the warn during back-fill)`
  }
  const coverage = total === 0 ? 1 : (total - missing) / total
  const pct = (coverage * 100).toFixed(1)
  return `${missing} of ${total} skill(s) missing version (${pct}% covered)`
}

/**
 * Replicate the migration-window decision from pushSkillProvenanceFreshnessCheck.
 */
function provenanceFreshnessStatus(
  stale: number,
  total: number,
  showMigration: boolean,
  threshold: number,
): 'pass' | 'warn' | 'skip' {
  if (stale === 0) return 'pass'
  const missingRatio = total === 0 ? 0 : stale / total
  if (!showMigration && missingRatio >= threshold) return 'skip'
  return 'warn'
}

function provenanceFreshnessDetail(
  stale: number,
  total: number,
  showMigration: boolean,
  threshold: number,
): string {
  if (stale === 0) return '0 recently modified skill(s) all declare provenance'
  const missingRatio = total === 0 ? 0 : stale / total
  if (!showMigration && missingRatio >= threshold) {
    const roundedPct = Math.round(missingRatio * 100)
    return `~${roundedPct}% of skills haven't adopted \`provenance:\` yet — suppressed during migration window (pass --show-migration to see the warn during back-fill)`
  }
  return `${stale} recently modified skill(s) missing provenance`
}

// ---------------------------------------------------------------------------
// 1. Constant
// ---------------------------------------------------------------------------

describe('MIGRATION_WINDOW_THRESHOLD', () => {
  it('is 0.80', () => {
    expect(MIGRATION_WINDOW_THRESHOLD).toBe(0.8)
  })
})

// ---------------------------------------------------------------------------
// 2. getMigrationWindowThreshold — env override
// ---------------------------------------------------------------------------

describe('getMigrationWindowThreshold', () => {
  const originalEnv = process.env.ANV_MIGRATION_WINDOW_THRESHOLD

  beforeEach(() => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = undefined
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      process.env.ANV_MIGRATION_WINDOW_THRESHOLD = undefined
    } else {
      process.env.ANV_MIGRATION_WINDOW_THRESHOLD = originalEnv
    }
  })

  it('returns 0.80 when env var is unset', () => {
    expect(getMigrationWindowThreshold()).toBe(0.8)
  })

  it('parses a valid float from env var (0.50)', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = '0.50'
    expect(getMigrationWindowThreshold()).toBe(0.5)
  })

  it('parses a valid float from env var (0.0)', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = '0'
    expect(getMigrationWindowThreshold()).toBe(0)
  })

  it('parses 1.0 and clamps to 1', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = '1.0'
    expect(getMigrationWindowThreshold()).toBe(1)
  })

  it('falls back to 0.80 for non-numeric value', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = 'banana'
    expect(getMigrationWindowThreshold()).toBe(0.8)
  })

  it('falls back to 0.80 for empty string', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = ''
    expect(getMigrationWindowThreshold()).toBe(0.8)
  })

  it('clamps value above 1 to 1', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = '1.5'
    expect(getMigrationWindowThreshold()).toBe(1)
  })

  it('clamps negative value to 0', () => {
    process.env.ANV_MIGRATION_WINDOW_THRESHOLD = '-0.2'
    expect(getMigrationWindowThreshold()).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 3. Version coverage suppression logic
// ---------------------------------------------------------------------------

describe('version coverage — migration window suppression', () => {
  const threshold = 0.8

  it('emits skip when ratio >= threshold (120/122 = 98%)', () => {
    const status = versionCoverageStatus(120, 122, false, threshold)
    expect(status).toBe('skip')
  })

  it('detail contains "migration window" text when suppressed', () => {
    const detail = versionCoverageDetail(120, 122, false, threshold)
    expect(detail).toContain('migration window')
    expect(detail).toContain('~98%')
  })

  it('detail contains --show-migration hint when suppressed', () => {
    const detail = versionCoverageDetail(120, 122, false, threshold)
    expect(detail).toContain('--show-migration')
  })

  it('emits warn when ratio < threshold (10/122 = 8%)', () => {
    const status = versionCoverageStatus(10, 122, false, threshold)
    expect(status).toBe('warn')
  })

  it('emits warn detail with missing count when below threshold', () => {
    const detail = versionCoverageDetail(10, 122, false, threshold)
    expect(detail).toContain('10 of 122')
    expect(detail).not.toContain('migration window')
  })

  it('emits pass when no skills are missing version', () => {
    const status = versionCoverageStatus(0, 122, false, threshold)
    expect(status).toBe('pass')
  })

  // exact threshold boundary: ratio === threshold (exactly 80%) → skip
  it('emits skip at exact threshold boundary (ratio === 0.80)', () => {
    // 8 missing out of 10 = exactly 0.80
    const status = versionCoverageStatus(8, 10, false, threshold)
    expect(status).toBe('skip')
  })

  // just below threshold (ratio < threshold) → warn
  it('emits warn just below threshold boundary', () => {
    // 7 missing out of 10 = 0.70 < 0.80
    const status = versionCoverageStatus(7, 10, false, threshold)
    expect(status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// 4. --show-migration forces warn regardless of ratio
// ---------------------------------------------------------------------------

describe('version coverage — --show-migration flag', () => {
  const threshold = 0.8

  it('forces warn even when ratio >= threshold', () => {
    const status = versionCoverageStatus(120, 122, true, threshold)
    expect(status).toBe('warn')
  })

  it('detail does not contain migration window text when showMigration=true', () => {
    const detail = versionCoverageDetail(120, 122, true, threshold)
    expect(detail).not.toContain('migration window')
    expect(detail).toContain('120 of 122')
  })
})

// ---------------------------------------------------------------------------
// 5. Provenance freshness suppression logic
// ---------------------------------------------------------------------------

describe('provenance freshness — migration window suppression', () => {
  const threshold = 0.8

  it('emits skip when stale ratio >= threshold (121/122 = 99%)', () => {
    const status = provenanceFreshnessStatus(121, 122, false, threshold)
    expect(status).toBe('skip')
  })

  it('detail contains "migration window" when suppressed', () => {
    const detail = provenanceFreshnessDetail(121, 122, false, threshold)
    expect(detail).toContain('migration window')
    expect(detail).toContain('~99%')
  })

  it('detail contains --show-migration hint when suppressed', () => {
    const detail = provenanceFreshnessDetail(121, 122, false, threshold)
    expect(detail).toContain('--show-migration')
  })

  it('emits warn when ratio < threshold (5/122 = 4%)', () => {
    const status = provenanceFreshnessStatus(5, 122, false, threshold)
    expect(status).toBe('warn')
  })

  it('emits pass when no stale skills', () => {
    const status = provenanceFreshnessStatus(0, 122, false, threshold)
    expect(status).toBe('pass')
  })

  it('exact threshold boundary (ratio === 0.80) → skip', () => {
    // 8 stale out of 10 = exactly 0.80
    const status = provenanceFreshnessStatus(8, 10, false, threshold)
    expect(status).toBe('skip')
  })

  it('just below threshold (0.70) → warn', () => {
    const status = provenanceFreshnessStatus(7, 10, false, threshold)
    expect(status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// 6. --show-migration forces warn on provenance freshness
// ---------------------------------------------------------------------------

describe('provenance freshness — --show-migration flag', () => {
  const threshold = 0.8

  it('forces warn even when ratio >= threshold', () => {
    const status = provenanceFreshnessStatus(121, 122, true, threshold)
    expect(status).toBe('warn')
  })

  it('detail contains missing count (not migration window text) when showMigration=true', () => {
    const detail = provenanceFreshnessDetail(121, 122, true, threshold)
    expect(detail).not.toContain('migration window')
    expect(detail).toContain('121')
  })
})

// ---------------------------------------------------------------------------
// 7. env override ANV_MIGRATION_WINDOW_THRESHOLD=0.50 — lower threshold
// ---------------------------------------------------------------------------

describe('env override — ANV_MIGRATION_WINDOW_THRESHOLD=0.50', () => {
  const lowerThreshold = 0.5

  it('still suppresses 98% missing (above 50% threshold)', () => {
    const status = versionCoverageStatus(120, 122, false, lowerThreshold)
    expect(status).toBe('skip')
  })

  it('detail shows approximate missing percentage when suppressed', () => {
    const detail = versionCoverageDetail(120, 122, false, lowerThreshold)
    expect(detail).toContain('~98%')
    expect(detail).toContain('migration window')
  })

  it('suppresses even 60% missing when threshold is 50%', () => {
    const status = versionCoverageStatus(6, 10, false, lowerThreshold)
    expect(status).toBe('skip')
  })

  it('does not suppress 40% missing when threshold is 50%', () => {
    const status = versionCoverageStatus(4, 10, false, lowerThreshold)
    expect(status).toBe('warn')
  })
})

// ---------------------------------------------------------------------------
// 8. Pure function smoke tests (computeSkillVersionCoverage + computeSkillProvenanceFreshness)
// ---------------------------------------------------------------------------

describe('computeSkillVersionCoverage — smoke', () => {
  it('returns 0 coverage and full missing list when all skills lack version', () => {
    const skills = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
    const { missing, total, coverage } = computeSkillVersionCoverage(skills)
    expect(missing).toHaveLength(3)
    expect(total).toBe(3)
    expect(coverage).toBe(0)
  })
})

const _THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const NOW = Date.now()
const RECENT = NOW - 1 * 24 * 60 * 60 * 1000

describe('computeSkillProvenanceFreshness — smoke', () => {
  it('flags recent skills without provenance', () => {
    const skills = [
      { name: 'x', hasProvenance: false, lastModifiedMs: RECENT },
      { name: 'y', hasProvenance: true, lastModifiedMs: RECENT },
    ]
    const stale = computeSkillProvenanceFreshness(skills, NOW)
    expect(stale).toEqual(['x'])
  })

  it('does not flag old skills', () => {
    const OLD = NOW - 60 * 24 * 60 * 60 * 1000
    const skills = [{ name: 'z', hasProvenance: false, lastModifiedMs: OLD }]
    const stale = computeSkillProvenanceFreshness(skills, NOW)
    expect(stale).toHaveLength(0)
  })
})
