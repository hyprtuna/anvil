/**
 * Plan 38 Phase D — Sub-D2 test:
 * `cli.tier='ultra'` resolves to claude-opus-4-7 + xhigh; source-tag is 'cli-tier'.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'

describe('resolveModel — cli.tier (Plan 38 Phase D)', () => {
  const config = buildDefaultConfig()

  it('cli.tier=ultra resolves to claude-opus-4-7 + xhigh, source=cli-tier', () => {
    const r = resolveModel('some-agent', config, { cli: { tier: 'ultra' } })
    expect(r.model).toBe('claude-opus-4-7')
    expect(r.effort).toBe('xhigh')
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier=quick resolves to claude-haiku-4-5, effort=undefined (clamped), source=cli-tier', () => {
    const r = resolveModel('some-agent', config, { cli: { tier: 'quick' } })
    expect(r.model).toBe('claude-haiku-4-5')
    // Haiku does not accept effort; quick tier has no effort → defaults.effort → clamped to undefined
    expect(r.effort).toBeUndefined()
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier=coding resolves to claude-sonnet-4-6 + medium, source=cli-tier', () => {
    const r = resolveModel('some-agent', config, { cli: { tier: 'coding' } })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.effort).toBe('medium')
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier=planning resolves to claude-opus-4-7 + high, source=cli-tier', () => {
    const r = resolveModel('some-agent', config, { cli: { tier: 'planning' } })
    expect(r.model).toBe('claude-opus-4-7')
    expect(r.effort).toBe('high')
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier=review resolves to claude-sonnet-4-6 + high, source=cli-tier', () => {
    const r = resolveModel('some-agent', config, { cli: { tier: 'review' } })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.effort).toBe('high')
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier=super resolves to claude-opus-4-7 + max, source=cli-tier', () => {
    const r = resolveModel('some-agent', config, { cli: { tier: 'super' } })
    expect(r.model).toBe('claude-opus-4-7')
    expect(r.effort).toBe('max')
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier overrides group resolution', () => {
    // 'planning' belongs to the planning group → would resolve to opus+high+source=group
    // But cli.tier=coding should win
    const r = resolveModel('planning', config, { cli: { tier: 'coding' } })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.source).toBe('cli-tier')
  })

  it('cli.tier overrides agent-frontmatter tier resolution', () => {
    // 'ultra-worker' has agents.ultra-worker.tier=ultra in defaults
    // cli.tier=coding should win because cli layers beat config layers
    const r = resolveModel('ultra-worker', config, { cli: { tier: 'coding' } })
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.source).toBe('cli-tier')
  })
})
