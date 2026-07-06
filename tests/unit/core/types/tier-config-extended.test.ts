/**
 * Plan 38 Phase C — TierConfig schema extension tests.
 * Verifies that `effort_range` and `fallback_chain` parse correctly
 * when present and when absent (both fields are optional).
 */
import { describe, expect, it } from 'vitest'
import { TierConfig } from '../../../../src/core/types.js'

describe('TierConfig (Plan 38 Phase C — effort_range + fallback_chain extensions)', () => {
  describe('parses successfully with all new fields present', () => {
    it('accepts model + effort + effort_range + fallback_chain', () => {
      const result = TierConfig.parse({
        model: 'best',
        effort: 'high',
        effort_range: ['low', 'high', 'max'],
        fallback_chain: ['claude-sonnet-4-6'],
      })
      expect(result.model).toBe('best')
      expect(result.effort).toBe('high')
      expect(result.effort_range).toEqual(['low', 'high', 'max'])
      expect(result.fallback_chain).toEqual(['claude-sonnet-4-6'])
    })
  })

  describe('parses successfully when new fields are absent (backwards compat)', () => {
    it('accepts model only — both new fields optional', () => {
      const result = TierConfig.parse({ model: 'best' })
      expect(result.model).toBe('best')
      expect(result.effort).toBeUndefined()
      expect(result.effort_range).toBeUndefined()
      expect(result.fallback_chain).toBeUndefined()
    })

    it('accepts model + effort without effort_range or fallback_chain', () => {
      const result = TierConfig.parse({ model: 'balanced', effort: 'medium' })
      expect(result.model).toBe('balanced')
      expect(result.effort).toBe('medium')
      expect(result.effort_range).toBeUndefined()
      expect(result.fallback_chain).toBeUndefined()
    })
  })

  describe('effort_range validation', () => {
    it('rejects effort_range with an invalid effort level', () => {
      expect(() =>
        TierConfig.parse({
          model: 'best',
          effort_range: ['invalid-effort'],
        }),
      ).toThrow()
    })

    it('accepts empty effort_range array (Haiku tier convention)', () => {
      const result = TierConfig.parse({
        model: 'cheap',
        effort_range: [],
      })
      expect(result.effort_range).toEqual([])
    })

    it('accepts full Sonnet effort_range (no xhigh)', () => {
      const result = TierConfig.parse({
        model: 'balanced',
        effort: 'medium',
        effort_range: ['low', 'medium', 'high', 'max'],
      })
      expect(result.effort_range).toHaveLength(4)
      expect(result.effort_range).not.toContain('xhigh')
    })

    it('accepts full Opus effort_range (includes xhigh)', () => {
      const result = TierConfig.parse({
        model: 'best',
        effort: 'high',
        effort_range: ['low', 'medium', 'high', 'xhigh', 'max'],
      })
      expect(result.effort_range).toHaveLength(5)
      expect(result.effort_range).toContain('xhigh')
    })
  })

  describe('fallback_chain validation', () => {
    it('accepts fallback_chain as array of strings', () => {
      const result = TierConfig.parse({
        model: 'best',
        fallback_chain: ['claude-sonnet-4-6', 'claude-haiku-4-5'],
      })
      expect(result.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })

    it('accepts empty fallback_chain array', () => {
      const result = TierConfig.parse({
        model: 'balanced',
        fallback_chain: [],
      })
      expect(result.fallback_chain).toEqual([])
    })
  })
})
