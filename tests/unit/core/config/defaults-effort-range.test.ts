/**
 * Plan 38 Phase C — defaults.ts effort_range per tier (research §A4 table).
 * Verifies that each tier's effort_range matches the model's supported levels:
 *   Haiku  (quick):                    [] — does not accept effort
 *   Sonnet (coding, review):           ['low','medium','high','max'] — no xhigh
 *   Opus   (planning, ultra, super):   ['low','medium','high','xhigh','max'] — full
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'

describe('defaults.ts — effort_range per tier (Plan 38 Phase C, research §A4)', () => {
  const config = buildDefaultConfig()
  const tiers = config.tiers!

  describe('quick tier (Haiku — no effort accepted)', () => {
    it('effort_range is an empty array', () => {
      expect(tiers.quick.effort_range).toEqual([])
    })

    it('does not contain any effort level', () => {
      expect(tiers.quick.effort_range).toHaveLength(0)
    })
  })

  describe('coding tier (Sonnet — no xhigh)', () => {
    it('effort_range is ["low","medium","high","max"]', () => {
      expect(tiers.coding.effort_range).toEqual([
        'low',
        'medium',
        'high',
        'max',
      ])
    })

    it('does not contain xhigh (Sonnet cannot accept xhigh)', () => {
      expect(tiers.coding.effort_range).not.toContain('xhigh')
    })
  })

  describe('review tier (Sonnet — no xhigh)', () => {
    it('effort_range is ["low","medium","high","max"]', () => {
      expect(tiers.review.effort_range).toEqual([
        'low',
        'medium',
        'high',
        'max',
      ])
    })

    it('does not contain xhigh (Sonnet cannot accept xhigh)', () => {
      expect(tiers.review.effort_range).not.toContain('xhigh')
    })
  })

  describe('planning tier (Opus — full range)', () => {
    it('effort_range is ["low","medium","high","xhigh","max"]', () => {
      expect(tiers.planning.effort_range).toEqual([
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ])
    })

    it('contains xhigh (Opus accepts all effort levels)', () => {
      expect(tiers.planning.effort_range).toContain('xhigh')
    })
  })

  describe('ultra tier (Opus — full range)', () => {
    it('effort_range is ["low","medium","high","xhigh","max"]', () => {
      expect(tiers.ultra.effort_range).toEqual([
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ])
    })

    it('contains xhigh (Opus accepts all effort levels)', () => {
      expect(tiers.ultra.effort_range).toContain('xhigh')
    })
  })

  describe('super tier (Opus — full range)', () => {
    it('effort_range is ["low","medium","high","xhigh","max"]', () => {
      expect(tiers.super.effort_range).toEqual([
        'low',
        'medium',
        'high',
        'xhigh',
        'max',
      ])
    })

    it('contains xhigh and max (Opus accepts all effort levels)', () => {
      expect(tiers.super.effort_range).toContain('xhigh')
      expect(tiers.super.effort_range).toContain('max')
    })
  })

  describe('parity: coding and review effort_ranges are identical', () => {
    it('coding.effort_range === review.effort_range (both Sonnet-backed)', () => {
      expect(tiers.coding.effort_range).toEqual(tiers.review.effort_range)
    })
  })

  describe('parity: planning, ultra, and super effort_ranges are identical', () => {
    it('planning.effort_range === ultra.effort_range (both Opus-backed)', () => {
      expect(tiers.planning.effort_range).toEqual(tiers.ultra.effort_range)
    })

    it('ultra.effort_range === super.effort_range (both Opus-backed)', () => {
      expect(tiers.ultra.effort_range).toEqual(tiers.super.effort_range)
    })
  })
})
