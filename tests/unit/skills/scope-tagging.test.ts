/**
 * ANV-0123 — SkillScope tagging + shadow detection tests.
 *
 * Uses tmpdir fixtures to exercise the loader's scope assignment from the
 * physical path roots (Project / Home / Bundled).
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  loadAllSkillsWithProviderStats,
  providerToScope,
} from '../../../src/skills/load-all.js'
import { SkillProvider } from '../../../src/skills/providers.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

function writeSkill(dir: string, slug: string, body = ''): void {
  mkdirSync(dir, { recursive: true })
  const content = `---
name: ${slug}
kind: atomic
group: development
description: scope test skill ${slug}
preferred_model: claude-sonnet-4-6
preferred_effort: medium
---

${body || `# ${slug} body`}
`
  writeFileSync(join(dir, `${slug}.md`), content)
}

describe('providerToScope() — provider→scope projection', () => {
  it('maps Project provider to project scope', () => {
    expect(providerToScope(SkillProvider.Project)).toBe('project')
  })
  it('maps Bundled provider to bundled scope', () => {
    expect(providerToScope(SkillProvider.Bundled)).toBe('bundled')
  })
  it('maps User provider to home scope', () => {
    expect(providerToScope(SkillProvider.User)).toBe('home')
  })
  it('maps Plugin provider to home scope', () => {
    expect(providerToScope(SkillProvider.Plugin)).toBe('home')
  })
  it('maps Harness provider to home scope', () => {
    expect(providerToScope(SkillProvider.Harness)).toBe('home')
  })
  it('maps Managed provider to home scope', () => {
    expect(providerToScope(SkillProvider.Managed)).toBe('home')
  })
})

describe('SkillScope tagging — loader integration', () => {
  let work: string
  let prevAnvilHome: string | undefined

  beforeEach(() => {
    work = createTestTmpDir('anv-0123')
    prevAnvilHome = process.env.ANVIL_HOME
    process.env.ANVIL_HOME = join(work, 'home-anvil')
  })

  afterEach(() => {
    if (prevAnvilHome === undefined) {
      Reflect.deleteProperty(process.env, 'ANVIL_HOME')
    } else {
      process.env.ANVIL_HOME = prevAnvilHome
    }
    rmSync(work, { recursive: true, force: true })
  })

  it('stamps Project scope on skills from <cwd>/.claude/skills/', async () => {
    writeSkill(join(work, '.claude', 'skills'), 'in-project')
    writeSkill(join(work, 'skills', 'universal'), 'in-bundled')
    const result = await loadAllSkillsWithProviderStats({
      skillsRoot: join(work, 'skills'),
      cwd: work,
    })
    const project = result.registry.get('in-project')
    const bundled = result.registry.get('in-bundled')
    expect(project?.scope).toBe('project')
    expect(bundled?.scope).toBe('bundled')
  })

  it('stamps Home scope on skills under ANVIL_HOME/skills', async () => {
    writeSkill(join(work, 'home-anvil', 'skills'), 'in-home')
    const result = await loadAllSkillsWithProviderStats({
      skillsRoot: join(work, 'skills'),
      cwd: work,
    })
    expect(result.registry.get('in-home')?.scope).toBe('home')
  })

  describe('shadow detection — three pairings', () => {
    it('Project > Bundled: project wins, scopeShadow records the pair', async () => {
      writeSkill(join(work, '.claude', 'skills'), 'shadowed', '# project copy')
      writeSkill(
        join(work, 'skills', 'universal'),
        'shadowed',
        '# bundled copy',
      )
      const result = await loadAllSkillsWithProviderStats({
        skillsRoot: join(work, 'skills'),
        cwd: work,
      })
      const winner = result.registry.get('shadowed')
      expect(winner?.scope).toBe('project')
      const shadow = result.scopeShadows.find((s) => s.slug === 'shadowed')
      expect(shadow).toBeDefined()
      expect(shadow?.winnerScope).toBe('project')
      expect(shadow?.shadowedScope).toBe('bundled')
    })

    it('Project > Home: project wins, scopeShadow records the pair', async () => {
      writeSkill(join(work, '.claude', 'skills'), 'shared', '# project copy')
      writeSkill(join(work, 'home-anvil', 'skills'), 'shared', '# home copy')
      const result = await loadAllSkillsWithProviderStats({
        skillsRoot: join(work, 'skills'),
        cwd: work,
      })
      expect(result.registry.get('shared')?.scope).toBe('project')
      const shadow = result.scopeShadows.find((s) => s.slug === 'shared')
      expect(shadow?.winnerScope).toBe('project')
      expect(shadow?.shadowedScope).toBe('home')
    })

    it('Home > Bundled: home wins, scopeShadow records the pair', async () => {
      writeSkill(join(work, 'home-anvil', 'skills'), 'hb', '# home copy')
      writeSkill(join(work, 'skills', 'universal'), 'hb', '# bundled copy')
      const result = await loadAllSkillsWithProviderStats({
        skillsRoot: join(work, 'skills'),
        cwd: work,
      })
      expect(result.registry.get('hb')?.scope).toBe('home')
      const shadow = result.scopeShadows.find((s) => s.slug === 'hb')
      expect(shadow?.winnerScope).toBe('home')
      expect(shadow?.shadowedScope).toBe('bundled')
    })
  })

  it('no shadow recorded when slug only exists in one scope', async () => {
    writeSkill(join(work, 'skills', 'universal'), 'unique', '# only here')
    const result = await loadAllSkillsWithProviderStats({
      skillsRoot: join(work, 'skills'),
      cwd: work,
    })
    expect(result.scopeShadows.find((s) => s.slug === 'unique')).toBeUndefined()
  })
})
