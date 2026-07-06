/**
 * Plan 38 Phase D — Sub-D2 test:
 * `cli.model='sonnet'` + `cli.tier='ultra'` → resolver returns Sonnet (model wins);
 * the __tierOverrideWarning side-channel is set with tier_overridden_by_model info.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'

describe('resolveModel — cli.model + cli.tier conflict (Plan 38 Phase D)', () => {
  const config = buildDefaultConfig()

  it('cli.model wins over cli.tier when both are present', () => {
    const r = resolveModel('some-agent', config, {
      cli: { model: 'claude-sonnet-4-6', tier: 'ultra' },
    })
    // Model wins → sonnet, not opus
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.source).toBe('cli')
  })

  it('source is cli (not cli-tier) when model wins', () => {
    const r = resolveModel('some-agent', config, {
      cli: { model: 'claude-haiku-4-5', tier: 'super' },
    })
    expect(r.source).toBe('cli')
  })

  it('alias-resolved model wins: sonnet alias → claude-sonnet-4-6 beats ultra tier', () => {
    const r = resolveModel('some-agent', config, {
      cli: { model: 'sonnet', tier: 'ultra' },
    })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.source).toBe('cli')
  })

  it('tier_overridden_by_model warning is attached to the opts object', () => {
    const opts = { cli: { model: 'claude-sonnet-4-6', tier: 'ultra' } }
    resolveModel('some-agent', config, opts)
    // The warning is stored on the opts object under __tierOverrideWarning
    const warning = (opts as Record<string, unknown>).__tierOverrideWarning as {
      type: string
      tier: string
      model: string
    }
    expect(warning).toBeDefined()
    expect(warning.type).toBe('tier_overridden_by_model')
    expect(warning.tier).toBe('ultra')
    expect(warning.model).toBe('claude-sonnet-4-6')
  })

  it('no warning when only tier is provided (no conflict)', () => {
    const opts = { cli: { tier: 'ultra' } }
    resolveModel('some-agent', config, opts)
    expect(
      (opts as Record<string, unknown>).__tierOverrideWarning,
    ).toBeUndefined()
  })

  it('no warning when only model is provided (no conflict)', () => {
    const opts = { cli: { model: 'claude-sonnet-4-6' } }
    resolveModel('some-agent', config, opts)
    expect(
      (opts as Record<string, unknown>).__tierOverrideWarning,
    ).toBeUndefined()
  })
})
