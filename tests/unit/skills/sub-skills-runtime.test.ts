/**
 * Plan 33 A7 — sub_skills runtime tests.
 *
 * Covers:
 * - runSkill execution order: sub-skills first in declared order, parent last
 * - child outputs are surfaced in ctx.subSkillOutputs
 * - subSkillContextBlock contains <sub-skill-outputs> when outputs are present
 * - parent body runs last (it is the last invocation)
 * - skills missing from registry are skipped (defect already recorded at load)
 * - skills with no sub_skills produce a single invocation (the parent)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { SkillRegistry } from '../../../src/core/registry/skill-registry.js'
import type { ProjectContext, Skill } from '../../../src/core/types.js'
import { runSkill } from '../../../src/skills/runtime.js'
import type { SkillRunContext } from '../../../src/skills/runtime.js'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function makeSkill(name: string, subSkills?: string[]): Skill {
  return {
    frontmatter: {
      name,
      group: 'development',
      description: `${name} description`,
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
      isHidden: false,
      'user-invocable': true,
      'disable-model-invocation': false,
      userInvocable: true,
      disableModelInvocation: false,
      argumentHint: undefined,
      allowedTools: undefined,
      breaking_changes_in: [],
      sub_skills: subSkills,
    } as Skill['frontmatter'],
    body: `body of ${name}`,
    sourcePath: `/tmp/${name}.md`,
    tier: 'universal',
    defects: [],
  }
}

const projectContext: ProjectContext = {
  languages: [],
  frameworks: [],
  testRunners: [],
  ci: [],
  detectedAt: new Date().toISOString(),
}

function makeCtx(subSkillOutputs: string[] = []): SkillRunContext {
  return {
    prompt: 'test prompt',
    subSkillOutputs,
    config: buildDefaultConfig(),
    projectContext,
  }
}

describe('runSkill — no sub_skills', () => {
  it('returns a single invocation (the parent) when no sub_skills declared', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('atomic-parent')
    registry.register(parent)

    const result = runSkill(parent, makeCtx(), registry)

    expect(result.invocations).toHaveLength(1)
    expect(result.invocations[0].skill.frontmatter.name).toBe('atomic-parent')
  })

  it('returns empty subSkillContextBlock when no subSkillOutputs', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('atomic-parent')
    registry.register(parent)

    const result = runSkill(parent, makeCtx([]), registry)
    expect(result.subSkillContextBlock).toBe('')
  })
})

describe('runSkill — with sub_skills', () => {
  it('schedules sub-skills before parent (execution order)', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('parent', ['child-1', 'child-2', 'child-3'])
    const child1 = makeSkill('child-1')
    const child2 = makeSkill('child-2')
    const child3 = makeSkill('child-3')

    registry.register(parent)
    registry.register(child1)
    registry.register(child2)
    registry.register(child3)

    const result = runSkill(parent, makeCtx(), registry)

    // 3 children + 1 parent = 4 invocations
    expect(result.invocations).toHaveLength(4)
    expect(result.invocations[0].skill.frontmatter.name).toBe('child-1')
    expect(result.invocations[1].skill.frontmatter.name).toBe('child-2')
    expect(result.invocations[2].skill.frontmatter.name).toBe('child-3')
    // Parent runs last
    expect(result.invocations[3].skill.frontmatter.name).toBe('parent')
  })

  it('parent is always the last invocation', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('the-parent', ['child-a', 'child-b'])
    registry.register(parent)
    registry.register(makeSkill('child-a'))
    registry.register(makeSkill('child-b'))

    const result = runSkill(parent, makeCtx(), registry)

    const last = result.invocations[result.invocations.length - 1]
    expect(last.skill.frontmatter.name).toBe('the-parent')
  })

  it('skips missing sub-skills (already recorded as defects at load)', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('parent', ['exists', 'does-not-exist'])
    registry.register(parent)
    registry.register(makeSkill('exists'))
    // 'does-not-exist' is not in registry

    const result = runSkill(parent, makeCtx(), registry)

    // Only 'exists' + parent scheduled (missing skipped)
    expect(result.invocations).toHaveLength(2)
    expect(result.invocations[0].skill.frontmatter.name).toBe('exists')
    expect(result.invocations[1].skill.frontmatter.name).toBe('parent')
  })
})

describe('runSkill — subSkillOutputs surfacing', () => {
  it('wraps outputs in <sub-skill-outputs> block when provided', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('parent', ['child'])
    registry.register(parent)
    registry.register(makeSkill('child'))

    const outputs = ['child output 1', 'child output 2']
    const result = runSkill(parent, makeCtx(outputs), registry)

    expect(result.subSkillContextBlock).toContain('<sub-skill-outputs>')
    expect(result.subSkillContextBlock).toContain('child output 1')
    expect(result.subSkillContextBlock).toContain('child output 2')
    expect(result.subSkillContextBlock).toContain('</sub-skill-outputs>')
  })

  it('returns empty subSkillContextBlock when outputs array is empty', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('parent', ['child'])
    registry.register(parent)
    registry.register(makeSkill('child'))

    const result = runSkill(parent, makeCtx([]), registry)
    expect(result.subSkillContextBlock).toBe('')
  })

  it('each child invocation carries its own resolved model/effort', () => {
    const registry = new SkillRegistry()
    const parent = makeSkill('parent', ['planning'])
    registry.register(parent)
    // 'planning' is in the planning group → resolves to opus/high
    registry.register(makeSkill('planning'))

    const result = runSkill(parent, makeCtx(), registry)

    const planningInvocation = result.invocations.find(
      (inv) => inv.skill.frontmatter.name === 'planning',
    )
    expect(planningInvocation).toBeDefined()
    // planning group resolves to opus (claude-opus-4-7 via 'opus' alias)
    expect(planningInvocation!.model).toBe('claude-opus-4-7')
    expect(planningInvocation!.effort).toBe('high')
  })
})
