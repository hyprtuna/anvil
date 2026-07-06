/**
 * Plan 38 Phase B — AgentTier enum tests.
 * Verifies the 6-tier enum accepts all new names and rejects the legacy
 * `standard`/`deep` values dropped in the Plan 38 Phase B migration.
 */
import { describe, expect, it } from 'vitest'
import { AgentTier } from '../../../../src/core/types.js'

describe('AgentTier (Plan 38 Phase B — 6-tier enum)', () => {
  describe('accepts all 6 new tier names', () => {
    it('parses "quick"', () => {
      expect(AgentTier.parse('quick')).toBe('quick')
    })

    it('parses "coding"', () => {
      expect(AgentTier.parse('coding')).toBe('coding')
    })

    it('parses "review"', () => {
      expect(AgentTier.parse('review')).toBe('review')
    })

    it('parses "planning"', () => {
      expect(AgentTier.parse('planning')).toBe('planning')
    })

    it('parses "ultra"', () => {
      expect(AgentTier.parse('ultra')).toBe('ultra')
    })

    it('parses "super"', () => {
      expect(AgentTier.parse('super')).toBe('super')
    })
  })

  describe('rejects legacy tier names removed in Plan 38 Phase B', () => {
    it('throws on "standard" (was quick/standard/deep tier)', () => {
      expect(() => AgentTier.parse('standard')).toThrow()
    })

    it('throws on "deep" (was quick/standard/deep tier)', () => {
      expect(() => AgentTier.parse('deep')).toThrow()
    })
  })

  describe('rejects other invalid values', () => {
    it('throws on "turbo"', () => {
      expect(() => AgentTier.parse('turbo')).toThrow()
    })

    it('throws on empty string', () => {
      expect(() => AgentTier.parse('')).toThrow()
    })

    it('throws on undefined', () => {
      expect(() => AgentTier.parse(undefined)).toThrow()
    })
  })

  describe('enum options list', () => {
    it('exports exactly 6 options in order', () => {
      expect(AgentTier.options).toEqual([
        'quick',
        'coding',
        'review',
        'planning',
        'ultra',
        'super',
      ])
    })
  })
})
