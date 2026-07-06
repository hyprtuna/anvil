import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'

describe('defaults.ts — quick tier Haiku effort bug fix (Plan 38 Phase A)', () => {
  it('quick tier has no effort field (Haiku does not accept effort)', () => {
    const config = buildDefaultConfig()
    // effort should be absent (undefined) — not 'medium' or any other value
    expect(config.tiers?.quick?.effort).toBeUndefined()
  })

  // Plan 38 Phase B: 'standard' and 'deep' tiers replaced with 6-tier enum.
  // Tests updated to reference the new tier names.
  it('coding tier has effort: medium', () => {
    const config = buildDefaultConfig()
    expect(config.tiers?.coding?.effort).toBe('medium')
  })

  it('planning tier has effort: high', () => {
    const config = buildDefaultConfig()
    expect(config.tiers?.planning?.effort).toBe('high')
  })

  it('ultra tier has effort: xhigh', () => {
    const config = buildDefaultConfig()
    expect(config.tiers?.ultra?.effort).toBe('xhigh')
  })

  it('super tier has effort: max', () => {
    const config = buildDefaultConfig()
    expect(config.tiers?.super?.effort).toBe('max')
  })

  it('quick tier still maps to the cheap alias (resolved by aliases.ts at runtime)', () => {
    const config = buildDefaultConfig()
    // Phase C: defaults.ts uses the provider-neutral alias 'cheap'; aliases.ts expands it to 'claude-haiku-4-5'
    expect(config.tiers?.quick?.model).toBe('cheap')
  })

  it('legacy "standard" and "deep" tier keys are absent from defaults', () => {
    const config = buildDefaultConfig()
    expect(config.tiers?.standard).toBeUndefined()
    expect(config.tiers?.deep).toBeUndefined()
  })
})
