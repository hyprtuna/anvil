import { describe, expect, it } from 'vitest'
import { findIntegrationGaps } from '../../../../src/core/integrations/scan.js'

describe('findIntegrationGaps', () => {
  it('returns empty array when no integrations defined for adapter', () => {
    expect(findIntegrationGaps('opencode', [])).toEqual([])
    expect(findIntegrationGaps('opencode', ['claude-mem'])).toEqual([])
  })

  it('returns empty array for unknown adapter', () => {
    expect(findIntegrationGaps('unknown-adapter', [])).toEqual([])
    expect(findIntegrationGaps('unknown-adapter', ['claude-mem'])).toEqual([])
  })

  it('returns a gap when no recommended slugs are installed', () => {
    const gaps = findIntegrationGaps('claude-code', [])
    expect(gaps.length).toBeGreaterThan(0)
    const memGap = gaps.find((g) => g.category === 'memory')
    expect(memGap).toBeDefined()
    expect(memGap?.recommended.length).toBeGreaterThan(0)
    expect(memGap?.recommended.some((r) => r.slug === 'claude-mem')).toBe(true)
  })

  it('returns no gap when a recommended slug is installed (present-skips-recommendation)', () => {
    const gaps = findIntegrationGaps('claude-code', ['claude-mem'])
    const memGap = gaps.find((g) => g.category === 'memory')
    expect(memGap).toBeUndefined()
  })

  it('is case-insensitive for slug matching', () => {
    // Upper-cased installed slug should still suppress the gap.
    const gapsUpper = findIntegrationGaps('claude-code', ['Claude-Mem'])
    const memGapUpper = gapsUpper.find((g) => g.category === 'memory')
    expect(memGapUpper).toBeUndefined()

    const gapsLower = findIntegrationGaps('claude-code', ['CLAUDE-MEM'])
    const memGapLower = gapsLower.find((g) => g.category === 'memory')
    expect(memGapLower).toBeUndefined()
  })

  it('handles malformed/empty installed slugs gracefully', () => {
    // Completely empty list — should return gaps but not throw.
    expect(() => findIntegrationGaps('claude-code', [])).not.toThrow()
    // Non-conflicting slugs — should still report gaps.
    const gaps = findIntegrationGaps('claude-code', ['some-other-plugin'])
    expect(Array.isArray(gaps)).toBe(true)
  })

  it('gap recommended array contains IntegrationEntry objects with correct fields', () => {
    const gaps = findIntegrationGaps('claude-code', [])
    for (const gap of gaps) {
      expect(typeof gap.category).toBe('string')
      for (const entry of gap.recommended) {
        expect(typeof entry.slug).toBe('string')
        expect(['memory', 'context', 'observability']).toContain(entry.category)
        expect(typeof entry.reason).toBe('string')
      }
    }
  })
})
