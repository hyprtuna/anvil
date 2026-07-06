import { describe, expect, it } from 'vitest'
import { SkillFrontmatter } from '../../../../src/core/types.js'

/**
 * Plan 44 Phase A — Skill provenance schema (Item 21).
 *
 * Verifies that the new optional `source`, `confidence`, and `created_at`
 * fields round-trip through the Zod schema correctly. Camel-case aliases
 * (`sourceProvenance`, `provenanceConfidence`, `createdAt`) are exposed by
 * the `.transform()` step for ergonomic TS access; the loader synthesizes
 * defaults — these tests exercise the schema only.
 */

const MINIMAL = {
  name: 'foo',
  description: 'Use when …',
  preferred_model: 'haiku',
  preferred_effort: 'low',
  group: 'development',
  kind: 'meta',
} as const

describe('SkillFrontmatter provenance fields (Plan 44 Phase A)', () => {
  it('round-trips source / confidence / created_at when declared', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      source: 'distilled',
      confidence: 0.85,
      created_at: '2026-04-28',
    })
    expect(result.source).toBe('distilled')
    expect(result.confidence).toBe(0.85)
    expect(result.created_at).toBe('2026-04-28')
    // camelCase aliases exposed by .transform()
    expect(result.sourceProvenance).toBe('distilled')
    expect(result.provenanceConfidence).toBe(0.85)
    expect(result.createdAt).toBe('2026-04-28')
  })

  it('defaults sourceProvenance to "unknown" when source is absent', () => {
    const result = SkillFrontmatter.parse(MINIMAL)
    expect(result.source).toBeUndefined()
    expect(result.sourceProvenance).toBe('unknown')
    expect(result.confidence).toBeUndefined()
    expect(result.created_at).toBeUndefined()
  })

  it('rejects an unknown source enum value', () => {
    expect(() =>
      SkillFrontmatter.parse({ ...MINIMAL, source: 'fabricated' }),
    ).toThrow()
  })

  it('rejects confidence outside [0, 1]', () => {
    expect(() =>
      SkillFrontmatter.parse({ ...MINIMAL, confidence: 1.5 }),
    ).toThrow()
    expect(() =>
      SkillFrontmatter.parse({ ...MINIMAL, confidence: -0.1 }),
    ).toThrow()
  })

  it('rejects malformed created_at (not YYYY-MM-DD)', () => {
    expect(() =>
      SkillFrontmatter.parse({ ...MINIMAL, created_at: '04/28/2026' }),
    ).toThrow()
    expect(() =>
      SkillFrontmatter.parse({ ...MINIMAL, created_at: '2026-4-28' }),
    ).toThrow()
  })

  it('accepts each enum value: authored / distilled / imported / unknown', () => {
    for (const source of [
      'authored',
      'distilled',
      'imported',
      'unknown',
    ] as const) {
      const result = SkillFrontmatter.parse({ ...MINIMAL, source })
      expect(result.source).toBe(source)
      expect(result.sourceProvenance).toBe(source)
    }
  })
})
