import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { ModelsConfig } from '../../../../src/core/types.js'

describe('core/config/defaults', () => {
  it('builds a valid ModelsConfig', () => {
    const config = buildDefaultConfig()
    expect(() => ModelsConfig.parse(config)).not.toThrow()
  })

  it('includes all 9 groups (Plan 32 C4 adds cost-optimised; adds workflow)', () => {
    const config = buildDefaultConfig()
    expect(Object.keys(config.groups).sort()).toEqual([
      'automation',
      'autonomous',
      'cost-optimised',
      'development',
      'meta',
      'planning',
      'review',
      'testing',
      'workflow',
    ])
  })

  it('includes the three required per-skill overrides', () => {
    const config = buildDefaultConfig()
    expect(config.overrides).toHaveProperty('ultra-worker')
    expect(config.overrides).toHaveProperty('skill-selection')
    expect(config.overrides).toHaveProperty('security-auditing')
  })

  it('sets sonnet (short alias) as the default model', () => {
    // Phase B+: defaults ship the short alias name; the resolver expands it
    // through BUILTIN_MODEL_ALIASES at resolve time. This makes provider
    // bumps a single-point change and lets non-Anthropic users override
    // via model_aliases in their own models.json.
    const config = buildDefaultConfig()
    expect(config.defaults.model).toBe('sonnet')
  })
})
