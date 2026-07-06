import { describe, expect, it } from 'vitest'
import { PlanFrontmatter } from '../../../../src/core/types.js'

const MINIMAL_MUST_HAVES = {
  truths: ['The feature works end-to-end'],
  artifacts: [{ path: 'src/foo.ts', provides: 'FooService' }],
  key_links: ['docs/spec.md'],
}

const MINIMAL_PLAN = {
  title: 'My feature plan',
  feature_slug: 'my-feature',
  version: '1.0.0',
  must_haves: MINIMAL_MUST_HAVES,
  phases: [{ name: 'Phase A', goal: 'Lay the foundation' }],
  validation: {
    tests: ['npm test -- tests/unit/my-feature'],
    commands: ['npm run typecheck'],
  },
}

describe('PlanFrontmatter', () => {
  it('parses a minimal valid plan frontmatter', () => {
    const result = PlanFrontmatter.parse(MINIMAL_PLAN)
    expect(result.title).toBe('My feature plan')
    expect(result.feature_slug).toBe('my-feature')
    expect(result.version).toBe('1.0.0')
    expect(result.phases).toHaveLength(1)
    expect(result.dependencies).toEqual([]) // default
  })

  it('requires must_haves — rejects when absent', () => {
    const { must_haves: _, ...withoutMustHaves } = MINIMAL_PLAN
    expect(() => PlanFrontmatter.parse(withoutMustHaves)).toThrow()
  })

  it('requires title — rejects when absent', () => {
    const { title: _, ...withoutTitle } = MINIMAL_PLAN
    expect(() => PlanFrontmatter.parse(withoutTitle)).toThrow()
  })

  it('requires feature_slug — rejects when absent', () => {
    const { feature_slug: _, ...withoutSlug } = MINIMAL_PLAN
    expect(() => PlanFrontmatter.parse(withoutSlug)).toThrow()
  })

  it('requires validation — rejects when absent', () => {
    const { validation: _, ...withoutValidation } = MINIMAL_PLAN
    expect(() => PlanFrontmatter.parse(withoutValidation)).toThrow()
  })

  it('defaults dependencies to empty array when not provided', () => {
    const result = PlanFrontmatter.parse(MINIMAL_PLAN)
    expect(result.dependencies).toEqual([])
  })

  it('accepts dependencies when provided', () => {
    const result = PlanFrontmatter.parse({
      ...MINIMAL_PLAN,
      dependencies: ['plan-35', 'plan-34'],
    })
    expect(result.dependencies).toEqual(['plan-35', 'plan-34'])
  })

  it('accepts covered_decisions with D-NN: format strings inside must_haves', () => {
    const result = PlanFrontmatter.parse({
      ...MINIMAL_PLAN,
      must_haves: {
        ...MINIMAL_MUST_HAVES,
        covered_decisions: [
          'D-01: Use Zod for schemas',
          'D-12: No backwards compat',
        ],
      },
    })
    expect(result.must_haves.covered_decisions).toHaveLength(2)
    expect(result.must_haves.covered_decisions?.[0]).toBe(
      'D-01: Use Zod for schemas',
    )
  })

  it('covered_decisions is optional — absent is valid', () => {
    const result = PlanFrontmatter.parse(MINIMAL_PLAN)
    expect(result.must_haves.covered_decisions).toBeUndefined()
  })

  it('MustHaves.artifacts supports all optional sub-fields', () => {
    const result = PlanFrontmatter.parse({
      ...MINIMAL_PLAN,
      must_haves: {
        ...MINIMAL_MUST_HAVES,
        artifacts: [
          {
            path: 'src/core/types.ts',
            provides: 'WorkflowConfig',
            min_lines: 10,
            exports: ['WorkflowConfig'],
            contains: ['z.boolean()'],
          },
        ],
      },
    })
    const artifact = result.must_haves.artifacts[0]
    expect(artifact.provides).toBe('WorkflowConfig')
    expect(artifact.min_lines).toBe(10)
    expect(artifact.exports).toEqual(['WorkflowConfig'])
    expect(artifact.contains).toEqual(['z.boolean()'])
  })

  it('rejects min_lines that is negative', () => {
    expect(() =>
      PlanFrontmatter.parse({
        ...MINIMAL_PLAN,
        must_haves: {
          ...MINIMAL_MUST_HAVES,
          artifacts: [{ path: 'src/foo.ts', min_lines: -1 }],
        },
      }),
    ).toThrow()
  })

  it('rejects min_lines that is a float', () => {
    expect(() =>
      PlanFrontmatter.parse({
        ...MINIMAL_PLAN,
        must_haves: {
          ...MINIMAL_MUST_HAVES,
          artifacts: [{ path: 'src/foo.ts', min_lines: 1.5 }],
        },
      }),
    ).toThrow()
  })

  it('accepts multiple phases', () => {
    const result = PlanFrontmatter.parse({
      ...MINIMAL_PLAN,
      phases: [
        { name: 'Phase A', goal: 'Types' },
        { name: 'Phase B', goal: 'Resolver' },
        { name: 'Phase C', goal: 'SDD' },
      ],
    })
    expect(result.phases).toHaveLength(3)
  })
})
