import { describe, expect, it } from 'vitest'
import { SkillFrontmatter } from '../../../../src/core/types.js'

/**
 * ANV-0058 — Structured `provenance` object in SkillFrontmatter.
 *
 * Verifies that the new optional `provenance` object field round-trips
 * through the Zod schema and that individual sub-field constraints
 * (lastUpdated ISO format, optionality of all sub-fields) are enforced.
 */

const MINIMAL = {
  name: 'foo',
  description: 'Use when …',
  preferred_model: 'haiku',
  preferred_effort: 'low',
  group: 'development',
  kind: 'meta',
} as const

describe('SkillFrontmatter provenance object', () => {
  it('parses when provenance is absent (optional field)', () => {
    const result = SkillFrontmatter.parse(MINIMAL)
    expect(result.provenance).toBeUndefined()
  })

  it('round-trips a full provenance object', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      provenance: {
        author: 'anvil-core',
        amendedFrom: 'old-debugging',
        generatedBy: 'brainstorm-spec',
        lastUpdated: '2026-05-10',
      },
    })
    expect(result.provenance).toEqual({
      author: 'anvil-core',
      amendedFrom: 'old-debugging',
      generatedBy: 'brainstorm-spec',
      lastUpdated: '2026-05-10',
    })
  })

  it('accepts provenance with only author set', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      provenance: { author: 'someone' },
    })
    expect(result.provenance?.author).toBe('someone')
    expect(result.provenance?.lastUpdated).toBeUndefined()
  })

  it('accepts ISO-8601 datetime as lastUpdated', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      provenance: { lastUpdated: '2026-05-10T14:30:00Z' },
    })
    expect(result.provenance?.lastUpdated).toBe('2026-05-10T14:30:00Z')
  })

  it('accepts short date (YYYY-MM-DD) as lastUpdated', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      provenance: { lastUpdated: '2026-05-10' },
    })
    expect(result.provenance?.lastUpdated).toBe('2026-05-10')
  })

  it('rejects malformed lastUpdated (not ISO format)', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL,
        provenance: { lastUpdated: '10/05/2026' },
      }),
    ).toThrow()
  })

  it('rejects malformed lastUpdated (partial date)', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL,
        provenance: { lastUpdated: '2026-5-1' },
      }),
    ).toThrow()
  })

  it('coexists with existing flat source/confidence/created_at fields', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      source: 'authored',
      confidence: 0.9,
      created_at: '2026-01-15',
      provenance: { author: 'anvil-core', lastUpdated: '2026-05-10' },
    })
    expect(result.source).toBe('authored')
    expect(result.sourceProvenance).toBe('authored')
    expect(result.provenance?.author).toBe('anvil-core')
  })

  it('accepts an empty provenance object (all sub-fields optional)', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL,
      provenance: {},
    })
    expect(result.provenance).toEqual({})
  })
})
