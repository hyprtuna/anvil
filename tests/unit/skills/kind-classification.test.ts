import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadSkillsFromDir } from '../../../src/skills/loader.js'

async function collectSkills(dir: string, tier: 'universal' | 'language') {
  if (!existsSync(dir)) return []
  return loadSkillsFromDir(dir, tier)
}

async function collectAllShipped() {
  const root = join(process.cwd(), 'skills')
  const universal = await collectSkills(join(root, 'universal'), 'universal')

  const languagesRoot = join(root, 'languages')
  const langEntries = existsSync(languagesRoot)
    ? (await readdir(languagesRoot, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : []
  const languages = (
    await Promise.all(
      langEntries.map((lang) =>
        collectSkills(join(languagesRoot, lang), 'language'),
      ),
    )
  ).flat()

  return [...universal, ...languages]
}

describe('skills/kind classification', () => {
  it('every shipped skill declares a kind', async () => {
    const all = await collectAllShipped()
    const missing = all.filter((s) => !s.frontmatter.kind)
    expect(missing.map((s) => s.frontmatter.name)).toEqual([])
  })

  it('only valid kinds appear in the registry (atomic | composite | meta)', async () => {
    const all = await collectAllShipped()
    const valid = new Set(['atomic', 'composite', 'meta'])
    for (const s of all) {
      expect(valid.has(s.frontmatter.kind as string), s.frontmatter.name).toBe(
        true,
      )
    }
  })

  it('composite skills have either chains[], a workflow definition, or sub_skills (Plan 33 A5)', async () => {
    const all = await collectAllShipped()
    for (const s of all) {
      if (s.frontmatter.kind === 'composite') {
        const hasChains = s.frontmatter.chains.length > 0
        const hasWorkflow = Boolean(s.frontmatter.workflow)
        // Plan 33 A1: sub_skills is a third composition model for composite skills.
        // Mutually exclusive with chains, but equally valid as a composite declaration.
        const hasSubSkills =
          Array.isArray(s.frontmatter.sub_skills) &&
          s.frontmatter.sub_skills.length > 0
        expect(
          hasChains || hasWorkflow || hasSubSkills,
          s.frontmatter.name,
        ).toBe(true)
      }
    }
  })
})
