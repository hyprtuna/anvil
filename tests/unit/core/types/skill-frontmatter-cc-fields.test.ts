import { describe, expect, it } from 'vitest'
import { SkillFrontmatter } from '../../../../src/core/types.js'

/**
 * ANV-0072 — CC-native frontmatter fields: `context` and `agent`.
 *
 * Verifies:
 * 1. `context: fork` and `context: inherit` are accepted; absent is fine.
 * 2. Invalid `context` values are rejected.
 * 3. `agent` accepts a non-empty string slug; absent is fine.
 * 4. Empty `agent` string is rejected.
 * 5. Both fields co-exist with other SkillFrontmatter fields correctly.
 * 6. Existing skills without these fields continue to parse (back-compat).
 */

const MINIMAL_FRONTMATTER = {
  name: 'example-skill',
  description: 'Use when you need an example',
  preferred_model: 'balanced',
  preferred_effort: 'medium',
  group: 'development',
  kind: 'atomic',
} as const

describe('SkillFrontmatter CC-native fields — context', () => {
  it('accepts context: fork', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      context: 'fork',
    })
    expect(result.context).toBe('fork')
  })

  it('accepts context: inherit', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      context: 'inherit',
    })
    expect(result.context).toBe('inherit')
  })

  it('context is undefined when the field is absent (optional)', () => {
    const result = SkillFrontmatter.parse(MINIMAL_FRONTMATTER)
    expect(result.context).toBeUndefined()
  })

  it('rejects an invalid context value', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL_FRONTMATTER,
        context: 'isolated',
      }),
    ).toThrow()
  })

  it('rejects context: null', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL_FRONTMATTER,
        context: null,
      }),
    ).toThrow()
  })
})

describe('SkillFrontmatter CC-native fields — agent', () => {
  it('accepts a valid agent slug', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      agent: 'ultra-worker',
    })
    expect(result.agent).toBe('ultra-worker')
  })

  it('agent is undefined when the field is absent (optional)', () => {
    const result = SkillFrontmatter.parse(MINIMAL_FRONTMATTER)
    expect(result.agent).toBeUndefined()
  })

  it('rejects an empty agent string', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL_FRONTMATTER,
        agent: '',
      }),
    ).toThrow()
  })

  it('accepts a complex agent slug with hyphens', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      agent: 'plan-verifier',
    })
    expect(result.agent).toBe('plan-verifier')
  })
})

describe('SkillFrontmatter CC-native fields — back-compat', () => {
  it('existing skill without context or agent still parses', () => {
    const result = SkillFrontmatter.parse({
      name: 'code-review',
      kind: 'composite',
      group: 'review',
      description: 'Use when reviewing diffs or files for quality',
      preferred_model: 'opus',
      preferred_effort: 'high',
    })
    expect(result.context).toBeUndefined()
    expect(result.agent).toBeUndefined()
  })

  it('context and agent co-exist correctly on the same skill', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      context: 'fork',
      agent: 'ultra-worker',
    })
    expect(result.context).toBe('fork')
    expect(result.agent).toBe('ultra-worker')
  })

  it('context: fork co-exists with paths field', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      context: 'fork',
      paths: ['**/*.ts'],
    })
    expect(result.context).toBe('fork')
    expect(result.paths).toEqual(['**/*.ts'])
  })
})
