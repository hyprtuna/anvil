import { describe, expect, it } from 'vitest'
import { deriveSlug } from '../../../../src/core/worktree/slug.js'

describe('core/worktree/slug — deriveSlug', () => {
  it('derives slug from standard ANV header with em-dash', () => {
    expect(deriveSlug('ANV-0157 — Fix install-scope detection')).toBe(
      'anv-0157-fix-install-scope-detection',
    )
  })

  it('derives slug from the ticket header itself', () => {
    const result = deriveSlug(
      'ANV-0155 — anvil worktree create / anvil worktree cleanup commands',
    )
    // Should start with anv-0155- and be max 50 chars
    expect(result).toMatch(/^anv-0155-/)
    expect(result.length).toBeLessThanOrEqual(50)
  })

  it('handles realistic ticket header from', () => {
    const result = deriveSlug('ANV-0157 — Fix install-scope detection')
    expect(result).toBe('anv-0157-fix-install-scope-detection')
  })

  it('handles ASCII double-dash separator', () => {
    expect(deriveSlug('ANV-0100 - My feature title')).toBe(
      'anv-0100-my-feature-title',
    )
  })

  it('strips trailing period from title', () => {
    expect(deriveSlug('ANV-0101 — Feature with trailing.')).toBe(
      'anv-0101-feature-with-trailing',
    )
  })

  it('handles parentheses in title', () => {
    expect(deriveSlug('ANV-0102 — Feature (with parens)')).toBe(
      'anv-0102-feature-with-parens',
    )
  })

  it('handles slash in title', () => {
    expect(deriveSlug('ANV-0103 — Feature/subfeature')).toBe(
      'anv-0103-feature-subfeature',
    )
  })

  it('handles all-uppercase title', () => {
    expect(deriveSlug('ANV-0104 — MY FEATURE')).toBe('anv-0104-my-feature')
  })

  it('dedupes consecutive dashes', () => {
    expect(deriveSlug('ANV-0105 — feature -- with  spaces')).toBe(
      'anv-0105-feature-with-spaces',
    )
  })

  it('truncates at 50 chars at a dash boundary', () => {
    const long =
      'ANV-0106 — This is a very long title that exceeds the fifty character maximum limit for slugs'
    const result = deriveSlug(long)
    expect(result.length).toBeLessThanOrEqual(50)
    expect(result).toMatch(/^anv-0106-/)
    // Should not end with a dash
    expect(result).not.toMatch(/-$/)
  })

  it('throws on missing ANV-NNNN prefix', () => {
    expect(() => deriveSlug('Fix install-scope detection')).toThrow(/ANV-NNNN/)
  })

  it('throws on empty string', () => {
    expect(() => deriveSlug('')).toThrow(/ANV-NNNN/)
  })

  it('handles unicode title (NFKD + ASCII filter)', () => {
    // Accented characters should be decomposed and stripped
    const result = deriveSlug('ANV-0107 — Résumé feature')
    expect(result).toMatch(/^anv-0107-/)
    // Accented chars become ASCII base + stripped combining
    // Should only contain ASCII slug characters
    expect(result).toMatch(/^[a-z0-9-]+$/)
  })

  it('handles en-dash separator', () => {
    expect(deriveSlug('ANV-0108 – Feature with en-dash')).toBe(
      'anv-0108-feature-with-en-dash',
    )
  })

  it('lowercases ticket id', () => {
    const result = deriveSlug('ANV-0109 — Simple')
    expect(result).toMatch(/^anv-0109-/)
  })
})
