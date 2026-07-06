/**
 * Plan 38 Phase C — 6-tier end-to-end resolution integration tests.
 * For each of the 6 tiers, builds a minimal config with tiers from defaults,
 * sets an agent with `tier: <name>`, and calls the resolver.
 * Asserts the returned {model, effort} after clamping via Phase A.
 *
 * Expected results per tier:
 *   quick    → { model: 'claude-haiku-4-5', effort: undefined }
 *   coding   → { model: 'claude-sonnet-4-6', effort: 'medium' }
 *   review   → { model: 'claude-sonnet-4-6', effort: 'high' }
 *   planning → { model: 'claude-opus-4-7', effort: 'high' }
 *   ultra    → { model: 'claude-opus-4-7', effort: 'xhigh' }
 *   super    → { model: 'claude-opus-4-7', effort: 'max' }
 *
 * These rely on Phase A clamping + Phase B tier alias chain.
 * The integration test verifies the full path works end-to-end.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { resolveModel } from '../../../src/core/models/resolve.js'
import type { AgentTier } from '../../../src/core/types.js'

const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-7'

/**
 * Builds a test config with an agent named `test-agent-<tier>` assigned
 * the specified tier. Uses the defaults tiers block (from Phase C) to
 * resolve through the full alias chain.
 */
function makeConfig(tier: AgentTier) {
  const base = buildDefaultConfig()
  return {
    ...base,
    agents: {
      [`test-agent-${tier}`]: { tier },
    },
  }
}

describe('6-tier end-to-end resolution (Plan 38 Phase C + Phase A clamping)', () => {
  describe('quick tier → Haiku, no effort', () => {
    it('resolves to claude-haiku-4-5 with effort: undefined', () => {
      const config = makeConfig('quick')
      const r = resolveModel('test-agent-quick', config)
      expect(r.source).toBe('tier')
      expect(r.model).toBe(HAIKU)
      // Phase A clamp: Haiku does not accept effort → clamped to undefined
      expect(r.effort).toBeUndefined()
    })
  })

  describe('coding tier → Sonnet, effort: medium', () => {
    it('resolves to claude-sonnet-4-6 with effort: medium', () => {
      const config = makeConfig('coding')
      const r = resolveModel('test-agent-coding', config)
      expect(r.source).toBe('tier')
      expect(r.model).toBe(SONNET)
      expect(r.effort).toBe('medium')
    })
  })

  describe('review tier → Sonnet, effort: high', () => {
    it('resolves to claude-sonnet-4-6 with effort: high', () => {
      const config = makeConfig('review')
      const r = resolveModel('test-agent-review', config)
      expect(r.source).toBe('tier')
      expect(r.model).toBe(SONNET)
      expect(r.effort).toBe('high')
    })
  })

  describe('planning tier → Opus, effort: high', () => {
    it('resolves to claude-opus-4-7 with effort: high', () => {
      const config = makeConfig('planning')
      const r = resolveModel('test-agent-planning', config)
      expect(r.source).toBe('tier')
      expect(r.model).toBe(OPUS)
      expect(r.effort).toBe('high')
    })
  })

  describe('ultra tier → Opus, effort: xhigh', () => {
    it('resolves to claude-opus-4-7 with effort: xhigh', () => {
      const config = makeConfig('ultra')
      const r = resolveModel('test-agent-ultra', config)
      expect(r.source).toBe('tier')
      expect(r.model).toBe(OPUS)
      // Phase A clamp: Opus accepts xhigh → passes through unchanged
      expect(r.effort).toBe('xhigh')
    })
  })

  describe('super tier → Opus, effort: max', () => {
    it('resolves to claude-opus-4-7 with effort: max', () => {
      const config = makeConfig('super')
      const r = resolveModel('test-agent-super', config)
      expect(r.source).toBe('tier')
      expect(r.model).toBe(OPUS)
      // Phase A clamp: Opus accepts max → passes through unchanged
      expect(r.effort).toBe('max')
    })
  })

  describe('all 6 tiers produce source: tier', () => {
    const tiers: AgentTier[] = [
      'quick',
      'coding',
      'review',
      'planning',
      'ultra',
      'super',
    ]

    for (const tier of tiers) {
      it(`${tier} tier produces source: "tier"`, () => {
        const config = makeConfig(tier)
        const r = resolveModel(`test-agent-${tier}`, config)
        expect(r.source).toBe('tier')
      })
    }
  })

  describe('alias chain correctness (cheap → haiku → claude-haiku-4-5)', () => {
    it('quick tier resolves through cheap → haiku alias chain', () => {
      // defaults.tiers.quick.model = 'cheap'
      // aliases: cheap → claude-haiku-4-5 (BUILTIN_MODEL_ALIASES)
      const config = makeConfig('quick')
      const r = resolveModel('test-agent-quick', config)
      expect(r.model).toBe(HAIKU)
    })

    it('super tier resolves through best → opus alias chain', () => {
      // defaults.tiers.super.model = 'best'
      // aliases: best → claude-opus-4-7 (BUILTIN_MODEL_ALIASES)
      const config = makeConfig('super')
      const r = resolveModel('test-agent-super', config)
      expect(r.model).toBe(OPUS)
    })
  })
})
