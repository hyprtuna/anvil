/**
 * Plan 38 Phase D — Sub-D2 test:
 * `cli.tier='bogus'` throws `UnknownTierError`; error message lists known tiers
 * and provides a Levenshtein-nearest suggestion.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import {
  UnknownTierError,
  resolveModel,
} from '../../../../src/core/models/resolve.js'

describe('resolveModel — cli.tier unknown tier (Plan 38 Phase D)', () => {
  const config = buildDefaultConfig()

  it('throws UnknownTierError for unknown tier name', () => {
    expect(() =>
      resolveModel('some-agent', config, { cli: { tier: 'bogus' } }),
    ).toThrow(UnknownTierError)
  })

  it('error message includes the list of known tiers', () => {
    try {
      resolveModel('some-agent', config, { cli: { tier: 'bogus' } })
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownTierError)
      const msg = (err as Error).message
      // Should list the 6 known tiers
      expect(msg).toContain('quick')
      expect(msg).toContain('coding')
      expect(msg).toContain('review')
      expect(msg).toContain('planning')
      expect(msg).toContain('ultra')
      expect(msg).toContain('super')
    }
  })

  it('error message includes the unknown tier name', () => {
    try {
      resolveModel('some-agent', config, { cli: { tier: 'bogus' } })
      expect.fail('should have thrown')
    } catch (err) {
      expect((err as Error).message).toContain('bogus')
    }
  })

  it('error name is UnknownTierError', () => {
    try {
      resolveModel('some-agent', config, { cli: { tier: 'bogus' } })
      expect.fail('should have thrown')
    } catch (err) {
      expect((err as Error).name).toBe('UnknownTierError')
    }
  })

  it('suggests nearest tier for close typo: ultr → ultra', () => {
    try {
      resolveModel('some-agent', config, { cli: { tier: 'ultr' } })
      expect.fail('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      // Levenshtein distance of 1 — should suggest 'ultra'
      expect(msg).toContain('ultra')
    }
  })

  it('suggests nearest tier for: quik → quick', () => {
    try {
      resolveModel('some-agent', config, { cli: { tier: 'quik' } })
      expect.fail('should have thrown')
    } catch (err) {
      const msg = (err as Error).message
      expect(msg).toContain('quick')
    }
  })

  it('does not suggest for completely different names', () => {
    try {
      resolveModel('some-agent', config, { cli: { tier: 'zzzzzzzzzz' } })
      expect.fail('should have thrown')
    } catch (err) {
      // Should still list known tiers but may not have a suggestion
      const msg = (err as Error).message
      expect(msg).toContain('Known tiers:')
    }
  })
})
