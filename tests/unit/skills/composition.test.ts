/**
 * ANV-0092 — Composition-strategy frontmatter tests.
 *
 * Covers:
 *   - Pure composeBody() for each of the 4 strategies.
 *   - applyCompositionOverlays() integration against loaded fixture skills.
 *   - Schema validation: strategy+extends_skill pairing rules.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import { SkillFrontmatter } from '../../../src/core/types.js'
import {
  applyCompositionOverlays,
  composeBody,
} from '../../../src/skills/composition.js'
import { loadSkillsFromDir } from '../../../src/skills/loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(
  __dirname,
  '..',
  '..',
  'fixtures',
  'skills',
  'composition',
)

// ─── Pure composeBody() unit tests ──────────────────────────────────────────

describe('composeBody()', () => {
  const coreBody = 'Core body content.'
  const overrideBody = 'Override body.'

  it('replace: returns override body only', () => {
    const result = composeBody('replace', coreBody, overrideBody)
    expect(result).toBe('Override body.')
    expect(result).not.toContain('Core body')
  })

  it('prepend: override + double-newline + core', () => {
    const result = composeBody('prepend', coreBody, overrideBody)
    expect(result).toBe('Override body.\n\nCore body content.')
  })

  it('append: core + double-newline + override', () => {
    const result = composeBody('append', coreBody, overrideBody)
    expect(result).toBe('Core body content.\n\nOverride body.')
  })

  it('wrap: substitutes {CORE_TEMPLATE} with core body', () => {
    const override = 'Header\n\n{CORE_TEMPLATE}\n\nFooter'
    const result = composeBody('wrap', coreBody, override)
    expect(result).toBe('Header\n\nCore body content.\n\nFooter')
  })

  it('wrap: multiple {CORE_TEMPLATE} occurrences are all replaced', () => {
    const override = '{CORE_TEMPLATE} and again {CORE_TEMPLATE}'
    const result = composeBody('wrap', coreBody, override)
    expect(result).toBe('Core body content. and again Core body content.')
  })

  it('wrap: missing placeholder falls back to append', () => {
    const override = 'No placeholder here.'
    const result = composeBody('wrap', coreBody, override)
    // Falls back to append when {CORE_TEMPLATE} is absent
    expect(result).toBe('Core body content.\n\nNo placeholder here.')
  })
})

// ─── applyCompositionOverlays() integration tests ───────────────────────────

describe('applyCompositionOverlays()', () => {
  async function loadFixtureSkills(): Promise<Skill[]> {
    return loadSkillsFromDir(join(fixturesDir, 'universal'), 'universal', {
      lazy: false,
      scope: 'bundled',
    })
  }

  it('replace: composed body matches override body only', async () => {
    const skills = await loadFixtureSkills()
    const { applied } = applyCompositionOverlays(skills)

    const replaced = skills.find(
      (s) => s.frontmatter.name === 'overlay-replace',
    )
    expect(replaced).toBeDefined()
    expect(replaced!.body).toBe('Override body only — core is replaced.')
    expect(replaced!.body).not.toContain('Core body')

    const record = applied.find((a) => a.overlayName === 'overlay-replace')
    expect(record).toBeDefined()
    expect(record!.strategy).toBe('replace')
    expect(record!.coreName).toBe('core-skill')
  })

  it('prepend: composed body has override then core', async () => {
    const skills = await loadFixtureSkills()
    applyCompositionOverlays(skills)

    const prepended = skills.find(
      (s) => s.frontmatter.name === 'overlay-prepend',
    )
    expect(prepended).toBeDefined()
    expect(prepended!.body).toBe(
      'Prepended override preamble.\n\nCore body content.',
    )
  })

  it('append: composed body has core then override', async () => {
    const skills = await loadFixtureSkills()
    applyCompositionOverlays(skills)

    const appended = skills.find((s) => s.frontmatter.name === 'overlay-append')
    expect(appended).toBeDefined()
    expect(appended!.body).toBe(
      'Core body content.\n\nAppended override epilogue.',
    )
  })

  it('wrap: {CORE_TEMPLATE} replaced with core body', async () => {
    const skills = await loadFixtureSkills()
    applyCompositionOverlays(skills)

    const wrapped = skills.find((s) => s.frontmatter.name === 'overlay-wrap')
    expect(wrapped).toBeDefined()
    expect(wrapped!.body).toContain('Core body content.')
    expect(wrapped!.body).toContain('Wrap header.')
    expect(wrapped!.body).toContain('Wrap footer.')
    expect(wrapped!.body).not.toContain('{CORE_TEMPLATE}')
  })

  it('core skill body is not mutated by the overlay', async () => {
    const skills = await loadFixtureSkills()
    applyCompositionOverlays(skills)

    const core = skills.find((s) => s.frontmatter.name === 'core-skill')
    expect(core).toBeDefined()
    expect(core!.body).toBe('Core body content.')
  })

  it('warns and skips when extends_skill names a missing skill', async () => {
    const orphan: Skill = {
      frontmatter: SkillFrontmatter.parse({
        name: 'orphan-overlay',
        kind: 'atomic',
        group: 'test',
        description: 'Use when testing missing-core warning',
        preferred_model: 'claude-sonnet-4-6',
        preferred_effort: 'medium',
        strategy: 'replace',
        extends_skill: 'nonexistent-core',
        source: 'authored',
      }),
      body: 'Override body.',
      sourcePath: '/fake/orphan.md',
      tier: 'universal',
      scope: 'bundled',
      defects: [],
    }

    const { warnings } = applyCompositionOverlays([orphan])
    expect(warnings).toHaveLength(1)
    expect(warnings[0].overlayName).toBe('orphan-overlay')
    expect(warnings[0].message).toContain('nonexistent-core')
    // Body stays unchanged when core is missing
    expect(orphan.body).toBe('Override body.')
  })

  it('returns applied list with all 4 overlay strategies', async () => {
    const skills = await loadFixtureSkills()
    const { applied, warnings } = applyCompositionOverlays(skills)

    expect(warnings).toHaveLength(0)
    const strategies = applied.map((a) => a.strategy).sort()
    expect(strategies).toEqual(['append', 'prepend', 'replace', 'wrap'])
  })
})

// ─── Schema validation tests ─────────────────────────────────────────────────

describe('SkillFrontmatter composition schema validation', () => {
  const base = {
    name: 'test-skill',
    kind: 'atomic',
    group: 'development',
    description: 'Use when testing',
    preferred_model: 'claude-sonnet-4-6',
    preferred_effort: 'medium',
    source: 'authored',
  }

  it('accepts a skill with no strategy/extends_skill (backward compat)', () => {
    const result = SkillFrontmatter.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('accepts a skill with strategy + extends_skill both present', () => {
    const result = SkillFrontmatter.safeParse({
      ...base,
      strategy: 'append',
      extends_skill: 'some-core',
    })
    expect(result.success).toBe(true)
  })

  it('rejects strategy without extends_skill', () => {
    const result = SkillFrontmatter.safeParse({ ...base, strategy: 'replace' })
    expect(result.success).toBe(false)
  })

  it('rejects extends_skill without strategy', () => {
    const result = SkillFrontmatter.safeParse({
      ...base,
      extends_skill: 'some-core',
    })
    expect(result.success).toBe(false)
  })

  it('rejects strategy+extends_skill combined with sub_skills', () => {
    const result = SkillFrontmatter.safeParse({
      ...base,
      strategy: 'prepend',
      extends_skill: 'some-core',
      sub_skills: ['child-skill'],
    })
    expect(result.success).toBe(false)
  })
})
