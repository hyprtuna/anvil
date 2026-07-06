import { describe, expect, it } from 'vitest'
import { clampEffortWithTrace } from '../../../../../src/core/models/effort.js'

const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-7'

describe('clampEffortWithTrace — trace metadata', () => {
  describe('clamped: true scenarios', () => {
    it('returns clamped=true with reason when Haiku rejects effort', () => {
      const result = clampEffortWithTrace(HAIKU, 'medium')
      expect(result.clamped).toBe(true)
      expect(result.effort).toBeUndefined()
      expect(result.reason).toContain('claude-haiku-4-5')
      expect(result.reason).toContain('does not accept effort')
    })

    it('returns clamped=true with reason when Sonnet clamps xhigh to high', () => {
      const result = clampEffortWithTrace(SONNET, 'xhigh')
      expect(result.clamped).toBe(true)
      expect(result.effort).toBe('high')
      expect(result.reason).toContain("clamped 'xhigh' → 'high'")
      expect(result.reason).toContain('claude-sonnet-4-6')
    })
  })

  describe('clamped: false scenarios (pass-through)', () => {
    it('returns clamped=false when Sonnet accepts medium', () => {
      const result = clampEffortWithTrace(SONNET, 'medium')
      expect(result.clamped).toBe(false)
      expect(result.effort).toBe('medium')
      expect(result.reason).toBeUndefined()
    })

    it('returns clamped=false when Opus accepts xhigh', () => {
      const result = clampEffortWithTrace(OPUS, 'xhigh')
      expect(result.clamped).toBe(false)
      expect(result.effort).toBe('xhigh')
      expect(result.reason).toBeUndefined()
    })

    it('returns clamped=false when requested is undefined', () => {
      const result = clampEffortWithTrace(SONNET, undefined)
      expect(result.clamped).toBe(false)
      expect(result.effort).toBeUndefined()
      expect(result.reason).toBeUndefined()
    })
  })
})
