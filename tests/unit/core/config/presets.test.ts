import { describe, expect, it } from 'vitest'
import { buildPreset } from '../../../../src/core/config/presets.js'
import { ModelsConfig } from '../../../../src/core/types.js'

describe('core/config/presets', () => {
  // Phase B+: presets ship short aliases ('opus'/'sonnet'/'haiku'); the
  // resolver expands them at use-time via BUILTIN_MODEL_ALIASES.
  it('returns the default config for "balanced"', () => {
    const config = buildPreset('balanced')
    expect(() => ModelsConfig.parse(config)).not.toThrow()
    expect(config.defaults.model).toBe('sonnet')
    expect(config.groups.planning.model).toBe('opus')
  })

  it('uses haiku heavily for "cost-optimised"', () => {
    const config = buildPreset('cost-optimised')
    expect(config.defaults.model).toBe('haiku')
    expect(config.groups.development.model).toBe('sonnet')
    expect(config.groups.autonomous.model).toBe('opus')
  })

  it('uses opus everywhere for "max-quality"', () => {
    const config = buildPreset('max-quality')
    expect(config.defaults.model).toBe('opus')
    expect(config.groups.automation.model).toBe('opus')
    expect(config.groups.testing.model).toBe('opus')
  })

  it('uses haiku as default and sonnet for development for "speed-first"', () => {
    const config = buildPreset('speed-first')
    expect(config.defaults.model).toBe('haiku')
    expect(config.groups.development.model).toBe('sonnet')
  })
})
