/**
 * Plan 38 Phase B — TIER_ALIASES tests.
 * Verifies the 6-tier alias map drops legacy `standard`/`deep` entries and
 * maps each new tier to one of the three provider-neutral short aliases.
 */
import { describe, expect, it } from 'vitest'
import {
  TIER_ALIASES,
  resolveAlias,
} from '../../../../src/core/models/aliases.js'

const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-7'

describe('TIER_ALIASES (Plan 38 Phase B — 6-tier alias map)', () => {
  describe('all 6 tiers map to known short aliases', () => {
    it('quick maps to "cheap"', () => {
      expect(TIER_ALIASES.quick).toBe('cheap')
    })

    it('coding maps to "balanced"', () => {
      expect(TIER_ALIASES.coding).toBe('balanced')
    })

    it('review maps to "balanced"', () => {
      expect(TIER_ALIASES.review).toBe('balanced')
    })

    it('planning maps to "best"', () => {
      expect(TIER_ALIASES.planning).toBe('best')
    })

    it('ultra maps to "best"', () => {
      expect(TIER_ALIASES.ultra).toBe('best')
    })

    it('super maps to "best"', () => {
      expect(TIER_ALIASES.super).toBe('best')
    })
  })

  describe('legacy tiers are absent', () => {
    it('TIER_ALIASES.standard is undefined', () => {
      expect(TIER_ALIASES.standard).toBeUndefined()
    })

    it('TIER_ALIASES.deep is undefined', () => {
      expect(TIER_ALIASES.deep).toBeUndefined()
    })
  })

  describe('round-trip resolution: tier → short alias → concrete model ID', () => {
    it('quick → cheap → claude-haiku-4-5', () => {
      expect(resolveAlias('quick', {})).toBe(HAIKU)
    })

    it('coding → balanced → claude-sonnet-4-6', () => {
      expect(resolveAlias('coding', {})).toBe(SONNET)
    })

    it('review → balanced → claude-sonnet-4-6', () => {
      expect(resolveAlias('review', {})).toBe(SONNET)
    })

    it('planning → best → claude-opus-4-7', () => {
      expect(resolveAlias('planning', {})).toBe(OPUS)
    })

    it('ultra → best → claude-opus-4-7', () => {
      expect(resolveAlias('ultra', {})).toBe(OPUS)
    })

    it('super → best → claude-opus-4-7', () => {
      expect(resolveAlias('super', {})).toBe(OPUS)
    })
  })

  describe('provider override flows through tier chain', () => {
    it('overriding "best" redirects planning/ultra/super to the new model', () => {
      const userAliases = { best: 'gpt-5.4' }
      expect(resolveAlias('planning', userAliases)).toBe('gpt-5.4')
      expect(resolveAlias('ultra', userAliases)).toBe('gpt-5.4')
      expect(resolveAlias('super', userAliases)).toBe('gpt-5.4')
    })

    it('overriding "balanced" redirects coding/review to the new model', () => {
      const userAliases = { balanced: 'kimi-k2.5' }
      expect(resolveAlias('coding', userAliases)).toBe('kimi-k2.5')
      expect(resolveAlias('review', userAliases)).toBe('kimi-k2.5')
    })

    it('overriding "cheap" redirects quick to the new model', () => {
      const userAliases = { cheap: 'gemini-flash-2.0' }
      expect(resolveAlias('quick', userAliases)).toBe('gemini-flash-2.0')
    })
  })
})
