import { describe, expect, it } from 'vitest'
import { checkEffortModelCompat } from '../../../../src/core/doctor/tier-integrity.js'
import type { SupportedEffortsMap } from '../../../../src/core/models/effort.js'
import type { TierConfig } from '../../../../src/core/types.js'

/**
 * Minimal model_aliases for tests — maps the tier model names to concrete IDs
 * that the fixture registry recognizes.
 */
const STUB_ALIASES = {
  fast: 'claude-haiku-4-5',
  balanced: 'claude-sonnet-4-6',
  powerful: 'claude-opus-4-7',
  default: 'claude-sonnet-4-6',
}

/**
 * Fixture registry: Haiku rejects all effort; Sonnet accepts low/medium/high/max;
 * Opus accepts all five levels.
 */
const FIXTURE_REGISTRY: SupportedEffortsMap = {
  'claude-haiku-4-5': [],
  'claude-sonnet-4-6': ['low', 'medium', 'high', 'max'],
  'claude-opus-4-7': ['low', 'medium', 'high', 'xhigh', 'max'],
}

describe('checkEffortModelCompat', () => {
  it('warns when a Haiku-tier has effort set (Haiku rejects effort)', () => {
    const tiers: Record<string, TierConfig> = {
      quick: { model: 'claude-haiku-4-5', effort: 'medium' },
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('warn')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("tier 'quick'")
    expect(result.warnings[0]).toContain('effort')
    expect(result.warnings[0]).toContain('claude-haiku-4-5')
  })

  it('warns when Sonnet tier has effort "xhigh" (Sonnet does not accept xhigh)', () => {
    const tiers: Record<string, TierConfig> = {
      coding: { model: 'claude-sonnet-4-6', effort: 'xhigh' },
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('warn')
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain("tier 'coding'")
    expect(result.warnings[0]).toContain('xhigh')
  })

  it('passes when Opus tier has effort "max" (Opus accepts max)', () => {
    const tiers: Record<string, TierConfig> = {
      super: { model: 'claude-opus-4-7', effort: 'max' },
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('pass')
    expect(result.warnings).toHaveLength(0)
  })

  it('passes when Sonnet tier has effort "high" (Sonnet accepts high)', () => {
    const tiers: Record<string, TierConfig> = {
      review: { model: 'claude-sonnet-4-6', effort: 'high' },
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('pass')
    expect(result.warnings).toHaveLength(0)
  })

  it('passes for empty tiers config', () => {
    const result = checkEffortModelCompat({}, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('pass')
    expect(result.warnings).toHaveLength(0)
  })

  it('skips tiers without an effort field (no effort = no compatibility check)', () => {
    const tiers: Record<string, TierConfig> = {
      quick: { model: 'claude-haiku-4-5' },
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('pass')
    expect(result.warnings).toHaveLength(0)
  })

  it('skips tiers whose model is not in the registry', () => {
    const tiers: Record<string, TierConfig> = {
      custom: { model: 'some-unknown-model', effort: 'high' },
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    // Unknown model → skip, not warn
    expect(result.status).toBe('pass')
    expect(result.warnings).toHaveLength(0)
  })

  it('produces one warning per incompatible tier', () => {
    const tiers: Record<string, TierConfig> = {
      quick: { model: 'claude-haiku-4-5', effort: 'medium' }, // warn
      coding: { model: 'claude-sonnet-4-6', effort: 'xhigh' }, // warn
      super: { model: 'claude-opus-4-7', effort: 'xhigh' }, // pass
    }
    const result = checkEffortModelCompat(tiers, STUB_ALIASES, FIXTURE_REGISTRY)
    expect(result.status).toBe('warn')
    expect(result.warnings).toHaveLength(2)
  })
})
