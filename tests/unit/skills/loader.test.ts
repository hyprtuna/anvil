import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadSkillsFromDir } from '../../../src/skills/loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '..', '..', 'fixtures', 'skill-loader')

describe('skills/loader', () => {
  it('loads a valid skill from universal/', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'universal'),
      'universal',
    )
    const valid = skills.find((s) => s.frontmatter.name === 'valid')
    expect(valid).toBeDefined()
    expect(valid!.tier).toBe('universal')
    expect(valid!.body).toContain('Valid skill body')
  })

  it('skips a skill missing required frontmatter', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'universal'),
      'universal',
    )
    expect(
      skills.find((s) => s.sourcePath.endsWith('invalid-missing-name.md')),
    ).toBeUndefined()
  })

  it('tags language skills with their language', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'languages', 'javascript'),
      'language',
    )
    const jsSkill = skills.find((s) => s.frontmatter.name === 'valid')
    expect(jsSkill?.frontmatter.language).toBe('javascript')
    expect(jsSkill?.tier).toBe('language')
  })

  it('loads new optional fields (tags, aliases, isHidden, tooltip, license) when present', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'universal'),
      'universal',
    )
    const tagged = skills.find((s) => s.frontmatter.name === 'tagged')
    expect(tagged).toBeDefined()
    expect(tagged!.frontmatter.tags).toEqual(['planning', 'organizer'])
    expect(tagged!.frontmatter.aliases).toEqual(['plan this', 'organize work'])
    expect(tagged!.frontmatter.isHidden).toBe(true)
    expect(tagged!.frontmatter.tooltip).toBe('A helpful tooltip')
    expect(tagged!.frontmatter.license).toBe('MIT')
  })

  it('applies default values for new optional fields when absent', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'universal'),
      'universal',
    )
    const valid = skills.find((s) => s.frontmatter.name === 'valid')
    expect(valid).toBeDefined()
    expect(valid!.frontmatter.tags).toEqual([])
    expect(valid!.frontmatter.aliases).toEqual([])
    expect(valid!.frontmatter.isHidden).toBe(false)
    expect(valid!.frontmatter.tooltip).toBeUndefined()
    expect(valid!.frontmatter.license).toBeUndefined()
  })

  // ANV-0061: subdirectory form — skills/<tier>/<slug>/SKILL.md
  describe('subdirectory form', () => {
    it('loads a skill from the subdir form <slug>/SKILL.md', async () => {
      const skills = await loadSkillsFromDir(
        join(fixtures, 'universal'),
        'universal',
      )
      const subdir = skills.find((s) => s.frontmatter.name === 'subdir-skill')
      expect(subdir).toBeDefined()
      expect(subdir!.tier).toBe('universal')
      expect(subdir!.body).toContain('Subdir skill body')
      expect(subdir!.sourcePath).toContain('SKILL.md')
    })

    it('does not load reference files from inside a subdir-form skill directory', async () => {
      const skills = await loadSkillsFromDir(
        join(fixtures, 'universal'),
        'universal',
      )
      // references/extra.md inside the subdir should not be loaded as a skill
      const fromRef = skills.filter((s) => s.sourcePath.includes('references'))
      expect(fromRef).toHaveLength(0)
    })

    it('flat-form skills continue to load alongside subdir-form skills', async () => {
      const skills = await loadSkillsFromDir(
        join(fixtures, 'universal'),
        'universal',
      )
      const flat = skills.find((s) => s.frontmatter.name === 'valid')
      const subdir = skills.find((s) => s.frontmatter.name === 'subdir-skill')
      expect(flat).toBeDefined()
      expect(subdir).toBeDefined()
    })
  })
})
