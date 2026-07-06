import { describe, expect, it } from 'vitest'
import {
  AgentFrontmatter,
  SkillFrontmatter,
} from '../../../../src/core/types.js'

/**
 * ANV-0114 — `expected_tokens` frontmatter field on SkillFrontmatter and
 * AgentFrontmatter. Author-declared rough token estimate consumed by the
 * installer to render an aggregate "cost" before applying a selection.
 *
 * Contract:
 *   1. Optional — missing field is fine (backward compat).
 *   2. Non-negative integer; rejects negatives.
 *   3. Zero is permitted (e.g. a stub skill).
 *   4. Large ints accepted (no upper bound at schema level).
 *   5. Rejects floats and strings.
 */

const MIN_SKILL = {
  name: 'example-skill',
  description: 'Use when you need an example',
  preferred_model: 'balanced',
  preferred_effort: 'medium',
  group: 'development',
  kind: 'atomic',
} as const

const MIN_AGENT = {
  name: 'example-orchestrator',
  description: 'sample',
} as const

describe('SkillFrontmatter — expected_tokens', () => {
  it('field is undefined when absent', () => {
    const parsed = SkillFrontmatter.parse(MIN_SKILL)
    expect(parsed.expected_tokens).toBeUndefined()
  })

  it('accepts a positive integer', () => {
    const parsed = SkillFrontmatter.parse({
      ...MIN_SKILL,
      expected_tokens: 12000,
    })
    expect(parsed.expected_tokens).toBe(12000)
  })

  it('accepts a large integer (no upper bound)', () => {
    const parsed = SkillFrontmatter.parse({
      ...MIN_SKILL,
      expected_tokens: 1_000_000,
    })
    expect(parsed.expected_tokens).toBe(1_000_000)
  })

  it('accepts zero (e.g. stub skill)', () => {
    const parsed = SkillFrontmatter.parse({
      ...MIN_SKILL,
      expected_tokens: 0,
    })
    expect(parsed.expected_tokens).toBe(0)
  })

  it('rejects a negative integer', () => {
    expect(() =>
      SkillFrontmatter.parse({ ...MIN_SKILL, expected_tokens: -1 }),
    ).toThrow()
  })

  it('rejects a non-integer (float)', () => {
    expect(() =>
      SkillFrontmatter.parse({ ...MIN_SKILL, expected_tokens: 12.5 }),
    ).toThrow()
  })

  it('rejects a string', () => {
    expect(() =>
      SkillFrontmatter.parse({ ...MIN_SKILL, expected_tokens: '12000' }),
    ).toThrow()
  })

  it('co-exists with existing optional fields (activation, scope, paths)', () => {
    const parsed = SkillFrontmatter.parse({
      ...MIN_SKILL,
      expected_tokens: 4200,
      activation: { languages: ['typescript'] },
      paths: ['**/*.ts'],
    })
    expect(parsed.expected_tokens).toBe(4200)
    expect(parsed.activation).toBeDefined()
    expect(parsed.paths).toEqual(['**/*.ts'])
  })
})

describe('AgentFrontmatter — expected_tokens', () => {
  it('field is undefined when absent', () => {
    const parsed = AgentFrontmatter.parse(MIN_AGENT)
    expect(parsed.expected_tokens).toBeUndefined()
  })

  it('accepts a positive integer', () => {
    const parsed = AgentFrontmatter.parse({
      ...MIN_AGENT,
      expected_tokens: 25000,
    })
    expect(parsed.expected_tokens).toBe(25000)
  })

  it('accepts zero', () => {
    const parsed = AgentFrontmatter.parse({
      ...MIN_AGENT,
      expected_tokens: 0,
    })
    expect(parsed.expected_tokens).toBe(0)
  })

  it('rejects a negative integer', () => {
    expect(() =>
      AgentFrontmatter.parse({ ...MIN_AGENT, expected_tokens: -42 }),
    ).toThrow()
  })

  it('rejects a non-integer (float)', () => {
    expect(() =>
      AgentFrontmatter.parse({ ...MIN_AGENT, expected_tokens: 1.5 }),
    ).toThrow()
  })

  it('rejects unknown sibling fields (AgentFrontmatter is .strict())', () => {
    expect(() =>
      AgentFrontmatter.parse({
        ...MIN_AGENT,
        expected_tokens: 1000,
        bogus_field: true,
      }),
    ).toThrow()
  })
})
