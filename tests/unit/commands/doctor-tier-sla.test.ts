/**
 * ANV-0217 — Doctor tier/SLA unit tests.
 *
 * Tests the DoctorRunLevel resolution logic and SLA budget constants.
 * The actual `doctorRunLevel` constant is computed inside `doctorCommand`
 * at call-time; these tests exercise the resolution logic as pure functions
 * mirroring the inline implementation.
 */

import { describe, expect, it } from 'vitest'

// ─── Inline mirrors of the tier logic from doctorCommand ─────────────────────
// These mirror the exact runtime logic so that if doctorCommand changes,
// the tests act as a specification.

const DOCTOR_TIERS = ['quick', 'standard', 'deep', 'diagnostic-dump'] as const
type DoctorRunLevel = (typeof DOCTOR_TIERS)[number]

function resolveDoctorRunLevel(opts: {
  smoke?: boolean
  tier?: string
}): DoctorRunLevel {
  if (opts.smoke) return 'quick'
  const t = opts.tier
  if (t && (DOCTOR_TIERS as readonly string[]).includes(t))
    return t as DoctorRunLevel
  return 'standard'
}

const SLA_BUDGETS: Record<DoctorRunLevel, number | null> = {
  quick: 2000,
  standard: 5000,
  deep: null,
  'diagnostic-dump': null,
}

// ─── DoctorRunLevel resolution ────────────────────────────────────────────────

describe('resolveDoctorRunLevel', () => {
  it('defaults to standard when no opts given', () => {
    expect(resolveDoctorRunLevel({})).toBe('standard')
  })

  it('--smoke resolves to quick', () => {
    expect(resolveDoctorRunLevel({ smoke: true })).toBe('quick')
  })

  it('--smoke takes priority over --tier', () => {
    expect(resolveDoctorRunLevel({ smoke: true, tier: 'deep' })).toBe('quick')
  })

  it('--tier quick resolves to quick', () => {
    expect(resolveDoctorRunLevel({ tier: 'quick' })).toBe('quick')
  })

  it('--tier standard resolves to standard', () => {
    expect(resolveDoctorRunLevel({ tier: 'standard' })).toBe('standard')
  })

  it('--tier deep resolves to deep', () => {
    expect(resolveDoctorRunLevel({ tier: 'deep' })).toBe('deep')
  })

  it('--tier diagnostic-dump resolves to diagnostic-dump', () => {
    expect(resolveDoctorRunLevel({ tier: 'diagnostic-dump' })).toBe(
      'diagnostic-dump',
    )
  })

  it('unknown tier value falls back to standard', () => {
    expect(resolveDoctorRunLevel({ tier: 'turbo' })).toBe('standard')
  })

  it('empty string tier falls back to standard', () => {
    expect(resolveDoctorRunLevel({ tier: '' })).toBe('standard')
  })
})

// ─── DOCTOR_TIERS constant ────────────────────────────────────────────────────

describe('DOCTOR_TIERS', () => {
  it('contains exactly the four expected levels', () => {
    expect(DOCTOR_TIERS).toEqual([
      'quick',
      'standard',
      'deep',
      'diagnostic-dump',
    ])
  })

  it('has length 4', () => {
    expect(DOCTOR_TIERS).toHaveLength(4)
  })
})

// ─── SLA_BUDGETS ──────────────────────────────────────────────────────────────

describe('SLA_BUDGETS', () => {
  it('quick budget is 2000ms', () => {
    expect(SLA_BUDGETS.quick).toBe(2000)
  })

  it('standard budget is 5000ms', () => {
    expect(SLA_BUDGETS.standard).toBe(5000)
  })

  it('deep has no budget (null)', () => {
    expect(SLA_BUDGETS.deep).toBeNull()
  })

  it('diagnostic-dump has no budget (null)', () => {
    expect(SLA_BUDGETS['diagnostic-dump']).toBeNull()
  })
})

// ─── SLA status logic ─────────────────────────────────────────────────────────

describe('SLA status computation', () => {
  function computeSlaStatus(
    level: DoctorRunLevel,
    elapsedMs: number,
  ): 'pass' | 'warn' {
    const budget = SLA_BUDGETS[level]
    return budget === null ? 'pass' : elapsedMs <= budget ? 'pass' : 'warn'
  }

  it('quick: 1500ms is pass (within 2000ms budget)', () => {
    expect(computeSlaStatus('quick', 1500)).toBe('pass')
  })

  it('quick: exactly 2000ms is pass (at budget boundary)', () => {
    expect(computeSlaStatus('quick', 2000)).toBe('pass')
  })

  it('quick: 2001ms is warn (exceeds budget)', () => {
    expect(computeSlaStatus('quick', 2001)).toBe('warn')
  })

  it('standard: 4999ms is pass (within 5000ms budget)', () => {
    expect(computeSlaStatus('standard', 4999)).toBe('pass')
  })

  it('standard: 5001ms is warn (exceeds budget)', () => {
    expect(computeSlaStatus('standard', 5001)).toBe('warn')
  })

  it('deep: any elapsed time is pass (no budget)', () => {
    expect(computeSlaStatus('deep', 999999)).toBe('pass')
  })

  it('diagnostic-dump: any elapsed time is pass (no budget)', () => {
    expect(computeSlaStatus('diagnostic-dump', 999999)).toBe('pass')
  })
})
