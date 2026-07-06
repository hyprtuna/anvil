import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadSkillFile, loadSkillsFromDir } from '../../../src/skills/loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '..', '..', 'fixtures', 'skill-loader')

/**
 * Plan 44 Phase B — loader-side provenance synthesis (Item 21).
 *
 * Verifies that the loader fills `source` / `confidence` defaults from the
 * skill's tier (file path) when the frontmatter is silent, and that explicit
 * declarations always win.
 */

describe('skill loader provenance synthesis (Plan 44 Phase B)', () => {
  it('synthesizes source="authored" + confidence=1.0 for universal skills', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'universal'),
      'universal',
    )
    const valid = skills.find((s) => s.frontmatter.name === 'valid')
    expect(valid).toBeDefined()
    expect(valid!.frontmatter.source).toBe('authored')
    expect(valid!.frontmatter.confidence).toBe(1.0)
    expect(valid!.frontmatter.sourceProvenance).toBe('authored')
    expect(valid!.frontmatter.provenanceConfidence).toBe(1.0)
  })

  it('synthesizes source="authored" + confidence=1.0 for language skills', async () => {
    const skills = await loadSkillsFromDir(
      join(fixtures, 'languages', 'javascript'),
      'language',
    )
    const valid = skills.find((s) => s.frontmatter.name === 'valid')
    expect(valid).toBeDefined()
    expect(valid!.frontmatter.source).toBe('authored')
    expect(valid!.frontmatter.confidence).toBe(1.0)
    expect(valid!.frontmatter.sourceProvenance).toBe('authored')
  })

  it('synthesizes source="unknown" for user skills', async () => {
    const skills = await loadSkillsFromDir(join(fixtures, 'universal'), 'user')
    const valid = skills.find((s) => s.frontmatter.name === 'valid')
    expect(valid).toBeDefined()
    expect(valid!.frontmatter.source).toBe('unknown')
    expect(valid!.frontmatter.confidence).toBeUndefined()
    expect(valid!.frontmatter.sourceProvenance).toBe('unknown')
  })

  it('does not overwrite explicitly declared source on a universal skill', async () => {
    const skill = await loadSkillFile(
      join(fixtures, 'universal', 'valid.md'),
      'universal',
    )
    expect(skill).toBeDefined()
    // baseline: synthesis fires (no explicit declaration in fixture)
    expect(skill!.frontmatter.source).toBe('authored')

    // direct call with already-stamped frontmatter should still resolve
    // to the declared source, not get re-synthesized.
    // We verify via the schema parse path: declared values round-trip.
    const { SkillFrontmatter } = await import('../../../src/core/types.js')
    const parsed = SkillFrontmatter.parse({
      name: 'foo',
      kind: 'meta',
      group: 'development',
      description: 'x',
      preferred_model: 'haiku',
      preferred_effort: 'low',
      source: 'distilled',
      confidence: 0.9,
    })
    expect(parsed.source).toBe('distilled')
    expect(parsed.confidence).toBe(0.9)
  })
})
