import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAllSkills } from '../../../src/skills/load-all.js'

describe('skills/load-all', () => {
  it('picks up skills under skills/universal/ui/', async () => {
    const skillsRoot = join(process.cwd(), 'skills')
    const registry = await loadAllSkills({ skillsRoot })
    const names = registry.getAll().map((s) => s.frontmatter.name)
    expect(names).toContain('style-selection')
    expect(names).toContain('color-palette-design')
    expect(names).toContain('typography-pairings')
    expect(names).toContain('ux-reasoning-rules')
  })
})
