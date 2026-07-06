/**
 * Plan 38 Phase C — defaults.ts 6-tier block shape tests.
 * Verifies all 6 tiers are present and have the expected effort values.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'

describe('defaults.ts — 6-tier block shape (Plan 38 Phase C)', () => {
  const config = buildDefaultConfig()
  const tiers = config.tiers!

  describe('all 6 tiers are present', () => {
    it('has quick tier', () => {
      expect(tiers.quick).toBeDefined()
    })

    it('has coding tier', () => {
      expect(tiers.coding).toBeDefined()
    })

    it('has review tier', () => {
      expect(tiers.review).toBeDefined()
    })

    it('has planning tier', () => {
      expect(tiers.planning).toBeDefined()
    })

    it('has ultra tier', () => {
      expect(tiers.ultra).toBeDefined()
    })

    it('has super tier', () => {
      expect(tiers.super).toBeDefined()
    })

    it('has exactly 6 tiers (no extras)', () => {
      expect(Object.keys(tiers)).toHaveLength(6)
    })
  })

  describe('effort values per tier', () => {
    it('quick.effort is undefined (Haiku does not accept effort)', () => {
      expect(tiers.quick.effort).toBeUndefined()
    })

    it('coding.effort is "medium"', () => {
      expect(tiers.coding.effort).toBe('medium')
    })

    it('review.effort is "high"', () => {
      expect(tiers.review.effort).toBe('high')
    })

    it('planning.effort is "high"', () => {
      expect(tiers.planning.effort).toBe('high')
    })

    it('ultra.effort is "xhigh"', () => {
      expect(tiers.ultra.effort).toBe('xhigh')
    })

    it('super.effort is "max"', () => {
      expect(tiers.super.effort).toBe('max')
    })
  })

  describe('model aliases per tier (provider-neutral)', () => {
    it('quick uses "cheap" alias (resolves to Haiku)', () => {
      expect(tiers.quick.model).toBe('cheap')
    })

    it('coding uses "balanced" alias (resolves to Sonnet)', () => {
      expect(tiers.coding.model).toBe('balanced')
    })

    it('review uses "balanced" alias (resolves to Sonnet)', () => {
      expect(tiers.review.model).toBe('balanced')
    })

    it('planning uses "best" alias (resolves to Opus)', () => {
      expect(tiers.planning.model).toBe('best')
    })

    it('ultra uses "best" alias (resolves to Opus)', () => {
      expect(tiers.ultra.model).toBe('best')
    })

    it('super uses "best" alias (resolves to Opus)', () => {
      expect(tiers.super.model).toBe('best')
    })
  })

  describe('legacy tiers are absent', () => {
    it('"standard" tier is not present (removed in Phase B)', () => {
      expect((tiers as Record<string, unknown>).standard).toBeUndefined()
    })

    it('"deep" tier is not present (removed in Phase B)', () => {
      expect((tiers as Record<string, unknown>).deep).toBeUndefined()
    })
  })

  describe('per-agent overrides (Phase C additions)', () => {
    const agents = config.agents!

    it('researcher has tier: planning', () => {
      expect(agents.researcher?.tier).toBe('planning')
    })

    it('orchestrator has tier: planning', () => {
      expect(agents.orchestrator?.tier).toBe('planning')
    })

    it('ultra-worker has tier: ultra', () => {
      expect(agents['ultra-worker']?.tier).toBe('ultra')
    })

    it('security-auditing has tier: super', () => {
      expect(agents['security-auditing']?.tier).toBe('super')
    })
  })
})
