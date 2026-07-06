import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { resolveModel } from '../../src/core/models/resolve.js'
import { loadAllSkills } from '../../src/skills/load-all.js'

describe('integration: loadAllSkills', () => {
  it('loads all 21 universal skills', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const universalCount = registry
      .getAll()
      .filter((s) => s.tier === 'universal').length
    expect(universalCount).toBeGreaterThanOrEqual(30)
  })

  it('loads language overlays', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const jsSkills = registry
      .getAll()
      .filter((s) => s.frontmatter.language === 'javascript')
    expect(jsSkills.length).toBeGreaterThanOrEqual(2)
  })

  it('every skill has a resolvable model via the default config', async () => {
    const registry = await loadAllSkills({ skillsRoot: 'skills' })
    const config = buildDefaultConfig()
    for (const skill of registry.getAll()) {
      const resolution = resolveModel(skill.frontmatter.name, config)
      expect(resolution.model).toBeTruthy()
    }
  })
})
