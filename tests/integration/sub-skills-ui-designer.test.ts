/**
 * Plan 33 A7 — Integration test: ui-design sub_skills adoption.
 *
 * Loads the real skills/ tree and verifies:
 * - ui-design declares sub_skills: [color-palette-design, typography-pairings, style-selection]
 * - All three children are registered in the skill registry
 * - Children remain independently invokable (they have their own description/triggers)
 * - Children retain user-invocable: false (they are helpers, not direct user entry points)
 * - runSkill on ui-design produces 4 invocations (3 children + parent)
 * - Children are invoked in declared order (color-palette-design, typography-pairings, style-selection)
 * - Parent (ui-design) is the last invocation
 * - No defects on ui-design after graph resolution
 */
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import type { ProjectContext } from '../../src/core/types.js'
import { loadAllSkills } from '../../src/skills/load-all.js'
import { runSkill } from '../../src/skills/runtime.js'
import type { SkillRunContext } from '../../src/skills/runtime.js'

const SKILLS_ROOT = join(process.cwd(), 'skills')

const projectContext: ProjectContext = {
  languages: [],
  frameworks: [],
  testRunners: [],
  ci: [],
  detectedAt: new Date().toISOString(),
}

describe('ui-design sub_skills adoption (Plan 33 A5)', () => {
  it('ui-design declares the three expected sub_skills', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const uiDesigner = registry.get('ui-design')

    expect(uiDesigner).toBeDefined()
    expect(uiDesigner!.frontmatter.sub_skills).toEqual([
      'color-palette-design',
      'typography-pairings',
      'style-selection',
    ])
  })

  it('all three child skills are registered in the registry', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })

    expect(registry.get('color-palette-design')).toBeDefined()
    expect(registry.get('typography-pairings')).toBeDefined()
    expect(registry.get('style-selection')).toBeDefined()
  })

  it('ui-design has no defects (all children resolve)', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const uiDesigner = registry.get('ui-design')

    expect(uiDesigner!.defects).toHaveLength(0)
  })

  it('children retain user-invocable: false (they are helpers)', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })

    const colorPalette = registry.get('color-palette-design')
    const typography = registry.get('typography-pairings')
    const styleChooser = registry.get('style-selection')

    expect(colorPalette!.frontmatter.userInvocable).toBe(false)
    expect(typography!.frontmatter.userInvocable).toBe(false)
    expect(styleChooser!.frontmatter.userInvocable).toBe(false)
  })

  it('children are independently invokable (have descriptions and triggers)', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })

    const colorPalette = registry.get('color-palette-design')
    const typography = registry.get('typography-pairings')
    const styleChooser = registry.get('style-selection')

    // Each child has its own description (not the parent's)
    expect(colorPalette!.frontmatter.description).toBeTruthy()
    expect(colorPalette!.frontmatter.description).not.toBe(
      registry.get('ui-design')!.frontmatter.description,
    )
    expect(typography!.frontmatter.description).toBeTruthy()
    expect(styleChooser!.frontmatter.description).toBeTruthy()

    // Each child has intent-router triggers
    expect(colorPalette!.frontmatter.trigger.length).toBeGreaterThan(0)
    expect(typography!.frontmatter.trigger.length).toBeGreaterThan(0)
    expect(styleChooser!.frontmatter.trigger.length).toBeGreaterThan(0)
  })

  it('runSkill on ui-design produces 4 invocations in declared order', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const uiDesigner = registry.get('ui-design')!

    const ctx: SkillRunContext = {
      prompt: 'design a fintech dashboard',
      subSkillOutputs: [],
      config: buildDefaultConfig(),
      projectContext,
    }

    const result = runSkill(uiDesigner, ctx, registry)

    // 3 children + 1 parent = 4 invocations
    expect(result.invocations).toHaveLength(4)

    // Declared order: color-palette-design, typography-pairings, style-selection, ui-design
    expect(result.invocations[0].skill.frontmatter.name).toBe(
      'color-palette-design',
    )
    expect(result.invocations[1].skill.frontmatter.name).toBe(
      'typography-pairings',
    )
    expect(result.invocations[2].skill.frontmatter.name).toBe('style-selection')
    expect(result.invocations[3].skill.frontmatter.name).toBe('ui-design')
  })

  it('ui-design is the last invocation (parent runs last)', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const uiDesigner = registry.get('ui-design')!

    const ctx: SkillRunContext = {
      prompt: 'redesign my landing page',
      subSkillOutputs: [],
      config: buildDefaultConfig(),
      projectContext,
    }

    const result = runSkill(uiDesigner, ctx, registry)
    const last = result.invocations[result.invocations.length - 1]
    expect(last.skill.frontmatter.name).toBe('ui-design')
  })

  it('each child is invoked exactly once', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const uiDesigner = registry.get('ui-design')!

    const ctx: SkillRunContext = {
      prompt: 'build a todo app UI',
      subSkillOutputs: [],
      config: buildDefaultConfig(),
      projectContext,
    }

    const result = runSkill(uiDesigner, ctx, registry)

    const names = result.invocations.map((inv) => inv.skill.frontmatter.name)
    const childNames = [
      'color-palette-design',
      'typography-pairings',
      'style-selection',
    ]

    for (const childName of childNames) {
      const count = names.filter((n) => n === childName).length
      expect(count).toBe(1)
    }
  })

  it('subSkillContextBlock is populated when outputs are provided', async () => {
    const registry = await loadAllSkills({ skillsRoot: SKILLS_ROOT })
    const uiDesigner = registry.get('ui-design')!

    const ctx: SkillRunContext = {
      prompt: 'make it pop',
      subSkillOutputs: [
        'color-palette-design output: blue/white/gold palette',
        'typography-pairings output: Playfair Display + Inter',
        'style-selection output: Soft UI style',
      ],
      config: buildDefaultConfig(),
      projectContext,
    }

    const result = runSkill(uiDesigner, ctx, registry)

    expect(result.subSkillContextBlock).toContain('<sub-skill-outputs>')
    expect(result.subSkillContextBlock).toContain('color-palette-design output')
    expect(result.subSkillContextBlock).toContain('typography-pairings output')
    expect(result.subSkillContextBlock).toContain('style-selection output')
    expect(result.subSkillContextBlock).toContain('</sub-skill-outputs>')
  })
})
