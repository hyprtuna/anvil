import { describe, expect, it } from 'vitest'
import { checkStaleInstalledTiers } from '../../../../src/core/doctor/tier-integrity.js'

describe('checkStaleInstalledTiers', () => {
  it('warns when installed config has a "standard" tier key', () => {
    const config = { tiers: { standard: {}, planning: {} } }
    const result = checkStaleInstalledTiers(config)
    expect(result.status).toBe('warn')
    expect(result.staleKeys).toContain('standard')
    expect(result.staleKeys).not.toContain('planning')
  })

  it('warns when installed config has a "deep" tier key', () => {
    const config = { tiers: { quick: {}, deep: {} } }
    const result = checkStaleInstalledTiers(config)
    expect(result.status).toBe('warn')
    expect(result.staleKeys).toContain('deep')
    expect(result.staleKeys).not.toContain('quick')
  })

  it('warns for both "standard" and "deep" when both are present', () => {
    const config = { tiers: { standard: {}, deep: {}, quick: {} } }
    const result = checkStaleInstalledTiers(config)
    expect(result.status).toBe('warn')
    expect(result.staleKeys).toContain('standard')
    expect(result.staleKeys).toContain('deep')
    expect(result.staleKeys).not.toContain('quick')
  })

  it('passes when all tier keys are canonical (no stale keys)', () => {
    const config = {
      tiers: {
        quick: {},
        coding: {},
        review: {},
        planning: {},
        ultra: {},
        super: {},
      },
    }
    const result = checkStaleInstalledTiers(config)
    expect(result.status).toBe('pass')
    expect(result.staleKeys).toHaveLength(0)
  })

  it('passes when installed config has no tiers block', () => {
    const config = {} as { tiers?: Record<string, unknown> }
    const result = checkStaleInstalledTiers(config)
    expect(result.status).toBe('pass')
    expect(result.staleKeys).toHaveLength(0)
  })

  it('passes when installedConfig is null (no installed config)', () => {
    const result = checkStaleInstalledTiers(null)
    expect(result.status).toBe('pass')
    expect(result.staleKeys).toHaveLength(0)
  })

  it('passes when installed config has an empty tiers block', () => {
    const config = { tiers: {} }
    const result = checkStaleInstalledTiers(config)
    expect(result.status).toBe('pass')
    expect(result.staleKeys).toHaveLength(0)
  })
})
