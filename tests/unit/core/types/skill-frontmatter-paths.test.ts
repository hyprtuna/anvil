import { describe, expect, it } from 'vitest'
import { SkillFrontmatter } from '../../../../src/core/types.js'

/**
 * Plan 39 Phase C — paths field on SkillFrontmatter.
 *
 * Verifies that `paths` round-trips through the Zod schema correctly:
 * present and preserved when declared, absent (undefined) when omitted,
 * and rejected when the value is not an array.
 */

const MINIMAL_FRONTMATTER = {
  name: 'ts-rules',
  description: 'Use when editing TypeScript files',
  preferred_model: 'haiku',
  preferred_effort: 'low',
  group: 'rules',
  kind: 'meta',
} as const

describe('SkillFrontmatter paths field (Plan 39 Phase C)', () => {
  it('parses successfully and preserves paths when declared', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      paths: ['**/*.ts', '**/*.tsx'],
    })
    expect(result.paths).toEqual(['**/*.ts', '**/*.tsx'])
  })

  it('paths is undefined when the field is absent (optional)', () => {
    const result = SkillFrontmatter.parse(MINIMAL_FRONTMATTER)
    expect(result.paths).toBeUndefined()
  })

  it('rejects paths when the value is not an array', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL_FRONTMATTER,
        paths: '**/*.ts',
      }),
    ).toThrow()
  })

  it('rejects paths when the array contains an empty string', () => {
    expect(() =>
      SkillFrontmatter.parse({
        ...MINIMAL_FRONTMATTER,
        paths: [''],
      }),
    ).toThrow()
  })

  it('accepts a single-element paths array', () => {
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      paths: ['**/*.ts'],
    })
    expect(result.paths).toEqual(['**/*.ts'])
  })

  it('preserves paths with mixed glob patterns', () => {
    const globs = ['**/*.ts', '**/*.tsx', 'src/**/*.ts', '!**/*.d.ts']
    const result = SkillFrontmatter.parse({
      ...MINIMAL_FRONTMATTER,
      paths: globs,
    })
    expect(result.paths).toEqual(globs)
  })
})
