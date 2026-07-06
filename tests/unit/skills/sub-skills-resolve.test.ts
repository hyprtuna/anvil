/**
 * Plan 33 A7 — sub_skills resolve tests.
 *
 * Covers:
 * - SkillFrontmatter accepts sub_skills field
 * - sub_skills + chains mutual exclusivity refine
 * - Loader resolveSubSkillGraph: valid graph passes
 * - Missing sub-skills degrade gracefully (defects[] appended, parent loads)
 * - 2-hop cycle (a → b → a) throws SkillCycleError
 * - Multi-hop cycle (a → b → c → a) throws SkillCycleError with full path
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SkillRegistry } from '../../../src/core/registry/skill-registry.js'
import { SkillFrontmatter } from '../../../src/core/types.js'
import type { Skill } from '../../../src/core/types.js'
import { SkillCycleError } from '../../../src/skills/errors.js'
import { resolveSubSkillGraph } from '../../../src/skills/load-all.js'

// Silence the console.warn calls from resolveSubSkillGraph
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function makeMinimalFrontmatter(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    name: 'test-skill',
    kind: 'atomic',
    group: 'development',
    description: 'A test skill',
    trigger: [],
    preferred_model: 'claude-sonnet-4-6',
    preferred_effort: 'medium',
    inputs: [],
    outputs: [],
    tools: [],
    chains: [],
    language: 'universal',
    tags: [],
    aliases: [],
    'user-invocable': true,
    'disable-model-invocation': false,
    ...overrides,
  }
}

function makeSkill(name: string, subSkills?: string[]): Skill {
  return {
    frontmatter: {
      ...(makeMinimalFrontmatter({ name, sub_skills: subSkills }) as ReturnType<
        typeof SkillFrontmatter.parse
      >),
    } as Skill['frontmatter'],
    body: `body of ${name}`,
    sourcePath: `/tmp/${name}.md`,
    tier: 'universal',
    defects: [],
  }
}

describe('SkillFrontmatter — sub_skills field', () => {
  it('accepts a skill with sub_skills', () => {
    const raw = makeMinimalFrontmatter({
      name: 'parent',
      sub_skills: ['child-a', 'child-b'],
    })
    const result = SkillFrontmatter.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sub_skills).toEqual(['child-a', 'child-b'])
    }
  })

  it('accepts a skill without sub_skills (field is optional)', () => {
    const raw = makeMinimalFrontmatter({ name: 'atomic-skill' })
    const result = SkillFrontmatter.safeParse(raw)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sub_skills).toBeUndefined()
    }
  })

  it('accepts a skill with empty sub_skills array', () => {
    const raw = makeMinimalFrontmatter({ name: 'no-children', sub_skills: [] })
    const result = SkillFrontmatter.safeParse(raw)
    expect(result.success).toBe(true)
  })

  it('rejects a skill with both non-empty sub_skills and non-empty chains', () => {
    const raw = makeMinimalFrontmatter({
      name: 'conflict-skill',
      sub_skills: ['child-a'],
      chains: [{ before: 'other-skill' }],
    })
    const result = SkillFrontmatter.safeParse(raw)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msgs = result.error.issues.map((i) => i.message)
      expect(msgs.some((m) => m.includes('mutually exclusive'))).toBe(true)
    }
  })

  it('accepts sub_skills with empty chains (no conflict)', () => {
    const raw = makeMinimalFrontmatter({
      name: 'ok-skill',
      sub_skills: ['child-a'],
      chains: [],
    })
    const result = SkillFrontmatter.safeParse(raw)
    expect(result.success).toBe(true)
  })
})

describe('resolveSubSkillGraph — valid graph', () => {
  it('builds a graph and returns it for a parent with resolved children', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill('parent', ['child-a', 'child-b']))
    registry.register(makeSkill('child-a'))
    registry.register(makeSkill('child-b'))

    const graph = resolveSubSkillGraph(registry)

    expect(graph.nodes.get('parent')).toEqual(['child-a', 'child-b'])
    // child-a and child-b have no sub_skills, so they don't appear as keys
    expect(graph.nodes.has('child-a')).toBe(false)
  })

  it('returns empty nodes when no skill has sub_skills', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill('solo-a'))
    registry.register(makeSkill('solo-b'))

    const graph = resolveSubSkillGraph(registry)
    expect(graph.nodes.size).toBe(0)
  })
})

describe('resolveSubSkillGraph — missing sub-skills (degraded gracefully)', () => {
  it('appends defect entry when a sub-skill is missing and parent still loads', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('parent', ['exists', 'missing-skill'])
    registry.register(parent)
    registry.register(makeSkill('exists'))
    // 'missing-skill' is NOT registered

    resolveSubSkillGraph(registry)

    // Parent loaded — defect appended
    const loaded = registry.get('parent')
    expect(loaded).toBeDefined()
    expect(loaded!.defects).toHaveLength(1)
    expect(loaded!.defects[0]).toBe("sub-skill 'missing-skill' not found")
  })

  it('logs a warning for each missing sub-skill', () => {
    // ANV-0092: clear any warn calls from previous tests in this file
    // (vi.spyOn returns the cached spy — call count accumulates without a reset).
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    warnSpy.mockClear()
    const registry = new SkillRegistry()
    registry.register(makeSkill('parent', ['ghost-1', 'ghost-2']))

    resolveSubSkillGraph(registry)

    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})

describe('resolveSubSkillGraph — cycle detection', () => {
  it('throws SkillCycleError for a 2-hop cycle (a → b → a)', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill('skill-a', ['skill-b']))
    registry.register(makeSkill('skill-b', ['skill-a']))

    expect(() => resolveSubSkillGraph(registry)).toThrow(SkillCycleError)
  })

  it('includes the full cycle path in the 2-hop error message', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill('skill-a', ['skill-b']))
    registry.register(makeSkill('skill-b', ['skill-a']))

    try {
      resolveSubSkillGraph(registry)
      expect.fail('expected SkillCycleError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SkillCycleError)
      const cycleErr = err as SkillCycleError
      // The path should show the cycle: either "skill-a → skill-b → skill-a"
      // or "skill-b → skill-a → skill-b" depending on DFS order
      expect(cycleErr.cyclePath).toMatch(/skill-[ab] → skill-[ab] → skill-[ab]/)
      expect(cycleErr.message).toContain('sub_skills cycle detected')
    }
  })

  it('throws SkillCycleError for a multi-hop cycle (a → b → c → a)', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill('cycle-a', ['cycle-b']))
    registry.register(makeSkill('cycle-b', ['cycle-c']))
    registry.register(makeSkill('cycle-c', ['cycle-a']))

    expect(() => resolveSubSkillGraph(registry)).toThrow(SkillCycleError)
  })

  it('includes the full 3-node cycle path in the multi-hop error message', () => {
    const registry = new SkillRegistry()
    registry.register(makeSkill('cycle-a', ['cycle-b']))
    registry.register(makeSkill('cycle-b', ['cycle-c']))
    registry.register(makeSkill('cycle-c', ['cycle-a']))

    try {
      resolveSubSkillGraph(registry)
      expect.fail('expected SkillCycleError to be thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(SkillCycleError)
      const cycleErr = err as SkillCycleError
      // Full path must include all 3 nodes + closing node, e.g.
      // "cycle-a → cycle-b → cycle-c → cycle-a"
      expect(cycleErr.cyclePath).toContain('cycle-a')
      expect(cycleErr.cyclePath).toContain('cycle-b')
      expect(cycleErr.cyclePath).toContain('cycle-c')
      // Should show the closing arrow back to start
      const parts = cycleErr.cyclePath.split(' → ')
      expect(parts).toHaveLength(4) // 3 nodes + 1 closing node
      // First and last must be the same (the cycle closes)
      expect(parts[0]).toBe(parts[parts.length - 1])
    }
  })
})
