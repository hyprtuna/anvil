/**
 * Phase B — Tier resolution tests.
 * Tests:
 *   - tier:standard resolves through tiers.standard.model
 *   - missing tier in tiers falls through to group (no crash)
 *   - circular tier alias is rejected at parse time
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'
import { ModelsConfig } from '../../../../src/core/types.js'

const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-7'

describe('core/models/tier-resolution (Phase B)', () => {
  describe('tier:planning resolves through tiers.planning.model', () => {
    it('resolves planning tier to opus (researcher default config has tier:planning)', () => {
      // Plan 38 Phase B: buildDefaultConfig() ships agents.researcher.tier='planning'
      // (migrated from 'standard' per audit MAJOR-2)
      const config = buildDefaultConfig()
      const r = resolveModel('researcher', config, {})
      expect(r.source).toBe('tier')
      expect(r.model).toBe(OPUS)
    })

    it('resolves coding tier explicitly when agents block is custom-built', () => {
      const config = buildDefaultConfig()
      const configWithTier = {
        ...config,
        agents: { researcher: { tier: 'coding' as const } },
        tiers: {
          quick: { model: HAIKU },
          coding: { model: SONNET, effort: 'medium' as const },
          review: { model: SONNET, effort: 'high' as const },
          planning: { model: OPUS, effort: 'high' as const },
          ultra: { model: OPUS, effort: 'xhigh' as const },
          super: { model: OPUS, effort: 'max' as const },
        },
      }
      const r = resolveModel('researcher', configWithTier)
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('tier')
    })

    it('resolves quick tier to haiku', () => {
      const config = {
        ...buildDefaultConfig(),
        agents: { 'fast-agent': { tier: 'quick' as const } },
        tiers: {
          quick: { model: HAIKU },
          coding: { model: SONNET, effort: 'medium' as const },
          planning: { model: OPUS, effort: 'high' as const },
        },
      }
      const r = resolveModel('fast-agent', config)
      expect(r.model).toBe(HAIKU)
      expect(r.source).toBe('tier')
    })

    it('resolves ultra tier to opus', () => {
      const config = {
        ...buildDefaultConfig(),
        agents: { 'ultra-agent': { tier: 'ultra' as const } },
        tiers: {
          quick: { model: HAIKU },
          coding: { model: SONNET, effort: 'medium' as const },
          planning: { model: OPUS, effort: 'high' as const },
          ultra: { model: OPUS, effort: 'xhigh' as const },
          super: { model: OPUS, effort: 'max' as const },
        },
      }
      const r = resolveModel('ultra-agent', config)
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('tier')
    })

    it('resolves review tier to sonnet', () => {
      const config = {
        ...buildDefaultConfig(),
        agents: { 'review-agent': { tier: 'review' as const } },
        tiers: {
          quick: { model: HAIKU },
          review: { model: SONNET, effort: 'high' as const },
        },
      }
      const r = resolveModel('review-agent', config)
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('tier')
    })
  })

  describe('missing tier in tiers falls through gracefully (no crash)', () => {
    it('falls through to group when tier name not in tiers map', () => {
      // researcher is in planning group → group fallback
      const config = {
        ...buildDefaultConfig(),
        // agents.researcher.tier = 'planning' but tiers is empty
        agents: { researcher: { tier: 'planning' as const } },
        tiers: {}, // empty — tier lookup will fail → fall through
      }
      const r = resolveModel('researcher', config)
      // Should fall through to group (planning group → OPUS)
      expect(r.source).toBe('group')
      expect(r.model).toBe('claude-opus-4-7') // planning group model (resolves through 'opus' alias)
    })

    it('falls through to default when tier not in tiers and skill not in group', () => {
      const config = {
        ...buildDefaultConfig(),
        agents: { 'unknown-agent': { tier: 'coding' as const } },
        tiers: {}, // empty → fall through
      }
      const r = resolveModel('unknown-agent', config)
      expect(r.source).toBe('default')
    })
  })

  describe('circular tier alias rejected at parse time', () => {
    it('rejects config where tiers.coding.model equals another tier name', () => {
      // Circular: tiers.foo.model = 'bar' where 'bar' is a tier name
      expect(() => {
        ModelsConfig.parse({
          ...buildDefaultConfig(),
          tiers: {
            quick: { model: HAIKU },
            coding: { model: 'planning' }, // circular: 'planning' is a tier name
            planning: { model: OPUS },
          },
          agents: {},
        })
      }).toThrow(/circular/i)
    })

    it('rejects config where tiers.quick.model equals tier name "coding"', () => {
      expect(() => {
        ModelsConfig.parse({
          ...buildDefaultConfig(),
          tiers: {
            quick: { model: 'coding' }, // 'coding' is a tier name
            coding: { model: SONNET },
          },
          agents: {},
        })
      }).toThrow(/circular/i)
    })

    it('accepts config where tier models are concrete (non-tier) model IDs', () => {
      expect(() => {
        ModelsConfig.parse({
          ...buildDefaultConfig(),
          tiers: {
            quick: { model: HAIKU },
            coding: { model: SONNET },
            planning: { model: OPUS },
          },
          agents: {},
        })
      }).not.toThrow()
    })
  })
})
