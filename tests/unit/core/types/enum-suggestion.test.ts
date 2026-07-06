/**
 * ANV-0215 — enum typo UX.
 *
 * When AgentTier or EffortLevel receives a typo, the Zod error message must:
 *   • Suggest the closest valid value when the edit distance is small.
 *   • List all valid options when the input is far from every valid value.
 *   • Pass through without error for every valid value.
 */
import { describe, expect, it } from 'vitest'
import { AgentTier, EffortLevel } from '../../../../src/core/types.js'

// ─── AgentTier ────────────────────────────────────────────────────────────────

describe('AgentTier — enum suggestion UX', () => {
  describe('valid values parse without error', () => {
    for (const tier of AgentTier.options) {
      it(`accepts '${tier}'`, () => {
        expect(AgentTier.parse(tier)).toBe(tier)
      })
    }
  })

  describe('close typo → "Did you mean …?"', () => {
    it("codign → Did you mean 'coding'?", () => {
      const result = AgentTier.safeParse('codign')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'coding'?")
      }
    })

    it("reviewr → Did you mean 'review'?", () => {
      const result = AgentTier.safeParse('reviewr')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'review'?")
      }
    })

    it("plannng → Did you mean 'planning'?", () => {
      const result = AgentTier.safeParse('plannng')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'planning'?")
      }
    })

    it("quikc → Did you mean 'quick'?", () => {
      const result = AgentTier.safeParse('quikc')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'quick'?")
      }
    })
  })

  describe('far-off value → lists valid options, no suggestion', () => {
    it('xyz → lists valid options', () => {
      const result = AgentTier.safeParse('xyz')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).not.toContain('Did you mean')
        // Should list the valid values
        expect(msg).toContain('quick')
        expect(msg).toContain('coding')
      }
    })

    it('completely_unknown → lists valid options, no suggestion', () => {
      const result = AgentTier.safeParse('completely_unknown')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        // edit distance to every valid tier is > half input length
        expect(msg).not.toContain('Did you mean')
        expect(msg).toContain('Valid values:')
      }
    })
  })
})

// ─── EffortLevel ──────────────────────────────────────────────────────────────

describe('EffortLevel — enum suggestion UX', () => {
  describe('valid values parse without error', () => {
    for (const effort of EffortLevel.options) {
      it(`accepts '${effort}'`, () => {
        expect(EffortLevel.parse(effort)).toBe(effort)
      })
    }
  })

  describe('close typo → "Did you mean …?"', () => {
    it("medim → Did you mean 'medium'?", () => {
      const result = EffortLevel.safeParse('medim')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'medium'?")
      }
    })

    it("hihg → Did you mean 'high'?", () => {
      const result = EffortLevel.safeParse('hihg')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'high'?")
      }
    })

    it("xhig → Did you mean 'xhigh'?", () => {
      const result = EffortLevel.safeParse('xhig')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).toContain("Did you mean 'xhigh'?")
      }
    })
  })

  describe('far-off value → lists valid options, no suggestion', () => {
    it('xyz → lists valid options', () => {
      const result = EffortLevel.safeParse('xyz')
      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.errors[0].message
        expect(msg).not.toContain('Did you mean')
        expect(msg).toContain('low')
        expect(msg).toContain('medium')
      }
    })
  })
})
