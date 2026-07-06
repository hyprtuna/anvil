/**
 * Plan 38 Phase A — resolver + effort clamp integration.
 * Tests that the clamp is applied correctly after model resolution.
 *
 * NOTE: Phase B tiers (ultra, super, coding, review, planning) are not yet
 * in the schema. This test only uses existing tiers (quick, standard, deep).
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'

const HAIKU = 'claude-haiku-4-5'
const OPUS = 'claude-opus-4-7'

describe('resolve + clampEffortForModel integration (Phase A)', () => {
  describe('quick tier → Haiku → effort clamped to undefined', () => {
    it('resolves quick tier agent to Haiku with no effort', () => {
      const config = {
        ...buildDefaultConfig(),
        agents: { 'fast-agent': { tier: 'quick' as const } },
      }
      const r = resolveModel('fast-agent', config)
      expect(r.model).toBe(HAIKU)
      expect(r.source).toBe('tier')
      // Haiku rejects effort — clamp strips it
      expect(r.effort).toBeUndefined()
    })
  })

  describe('Opus agent with xhigh effort — passes through unchanged', () => {
    it('resolves per-skill override with Opus + xhigh effort intact', () => {
      const config = buildDefaultConfig()
      // Inject an override for our test agent using Opus with xhigh effort.
      // The override layer sits at layer 6; Opus accepts xhigh, so no clamp.
      const configWithOverride = {
        ...config,
        overrides: {
          ...config.overrides,
          'deep-agent': {
            model: OPUS,
            effort: 'xhigh' as const,
            fallback_chain: [] as string[],
          },
        },
      }
      const r = resolveModel('deep-agent', configWithOverride)
      expect(r.model).toBe(OPUS)
      expect(r.effort).toBe('xhigh')
      expect(r.source).toBe('override')
    })
  })

  describe('CLI model injection with clamping', () => {
    it('CLI Haiku with explicit medium effort → clamped to undefined', () => {
      const config = buildDefaultConfig()
      const r = resolveModel('any-agent', config, {
        cli: { model: HAIKU, effort: 'medium' },
      })
      expect(r.model).toBe(HAIKU)
      expect(r.source).toBe('cli')
      // Haiku does not accept effort
      expect(r.effort).toBeUndefined()
    })

    it('CLI Sonnet with xhigh effort → clamped to high', () => {
      const config = buildDefaultConfig()
      const r = resolveModel('any-agent', config, {
        cli: { model: 'claude-sonnet-4-6', effort: 'xhigh' },
      })
      expect(r.model).toBe('claude-sonnet-4-6')
      expect(r.source).toBe('cli')
      expect(r.effort).toBe('high')
    })
  })

  describe('injected registry for testability', () => {
    it('passes custom registry through ResolveOptions', () => {
      const config = buildDefaultConfig()
      // Inject a registry where Haiku accepts medium only
      const customRegistry = { [HAIKU]: ['medium'] as const }
      const r = resolveModel('code-explorer', config, {
        cli: { model: HAIKU, effort: 'high' },
        registry: customRegistry,
      })
      // high not in custom registry for Haiku → clamps to medium (highest at or below)
      expect(r.effort).toBe('medium')
    })
  })
})
