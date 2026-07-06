/**
 * ANV-0050 — SkillProvider enum + PROVIDER_DEFINITIONS table + SHA-256 dedupe.
 *
 * All tests are synthetic (no live filesystem).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { Skill } from '../../../src/core/types.js'
import {
  PROVIDER_ORDER,
  SkillProvider,
  contentHash,
  dedupeSkills,
} from '../../../src/skills/providers.js'
import type { LoadedProviderSkill } from '../../../src/skills/providers.js'

// ── helpers ────────────────────────────────────────────────────────────────

function makeSkill(
  name: string,
  body: string,
  provider: SkillProvider,
  dirBasename: string,
): LoadedProviderSkill {
  return {
    skill: {
      frontmatter: {
        name,
        kind: 'atomic',
        group: 'development',
        description: `skill ${name}`,
        preferred_model: 'claude-sonnet-4-6',
        preferred_effort: 'medium',
        trigger: [],
        language: 'universal',
        tags: [],
        aliases: [],
        isHidden: false,
        chains: [],
        source: 'authored',
        confidence: 1.0,
        userInvocable: true,
      },
      body,
      sourcePath: `/fake/${dirBasename}/${name}.md`,
      tier: 'universal',
      defects: [],
    } as Skill,
    provider,
    dirBasename,
  }
}

// ── 1. Provider order golden snapshot ─────────────────────────────────────

describe('PROVIDER_ORDER golden snapshot', () => {
  it('has exactly the expected providers in rank order', () => {
    // This test fails if a provider is removed or reordered.
    expect(PROVIDER_ORDER).toEqual([
      SkillProvider.Managed,
      SkillProvider.Project,
      SkillProvider.User,
      SkillProvider.Plugin,
      SkillProvider.Harness,
      SkillProvider.Bundled,
    ])
  })

  it('all SkillProvider enum values are present in PROVIDER_ORDER', () => {
    const enumValues = Object.values(SkillProvider).filter(
      (v) => typeof v === 'number',
    ) as number[]
    expect(PROVIDER_ORDER.length).toBe(enumValues.length)
    for (const v of enumValues) {
      expect(PROVIDER_ORDER).toContain(v)
    }
  })

  it('each provider has a strictly lower numeric rank than the next', () => {
    for (let i = 0; i < PROVIDER_ORDER.length - 1; i++) {
      expect(PROVIDER_ORDER[i]).toBeLessThan(PROVIDER_ORDER[i + 1])
    }
  })
})

// ── 2. contentHash ─────────────────────────────────────────────────────────

describe('contentHash', () => {
  it('returns the SHA-256 of (dirBasename + NUL + content)', () => {
    const dir = 'universal'
    const content = 'hello world'
    const expected = createHash('sha256')
      .update(`${dir}\0${content}`)
      .digest('hex')
    expect(contentHash(dir, content)).toBe(expected)
  })

  it('produces different hashes for different dir basenames', () => {
    expect(contentHash('alpha', 'same body')).not.toBe(
      contentHash('beta', 'same body'),
    )
  })

  it('produces different hashes for different content', () => {
    expect(contentHash('dir', 'body A')).not.toBe(contentHash('dir', 'body B'))
  })
})

// ── 3. dedupeSkills — byte-identical content ───────────────────────────────

describe('dedupeSkills — byte-identical content across providers', () => {
  it('keeps the higher-rank provider entry when two providers ship byte-identical content', () => {
    const managed = makeSkill(
      'my-skill',
      'exact body',
      SkillProvider.Managed,
      'universal',
    )
    const bundled = makeSkill(
      'my-skill',
      'exact body',
      SkillProvider.Bundled,
      'universal',
    )

    // Bundled (rank=50) is lower priority than Managed (rank=0)
    const { kept, shadowed } = dedupeSkills([managed, bundled])
    expect(kept).toHaveLength(1)
    expect(kept[0].provider).toBe(SkillProvider.Managed)
    expect(shadowed).toHaveLength(1)
    expect(shadowed[0].provider).toBe(SkillProvider.Bundled)
  })

  it('two providers with byte-identical content produce one loaded entry', () => {
    const project = makeSkill('alpha', 'body', SkillProvider.Project, 'skills')
    const user = makeSkill('alpha', 'body', SkillProvider.User, 'skills')

    const { kept } = dedupeSkills([project, user])
    expect(kept).toHaveLength(1)
  })

  it('winner is always the one with the lowest numeric rank', () => {
    const harness = makeSkill('s', 'body', SkillProvider.Harness, 'd')
    const plugin = makeSkill('s', 'body', SkillProvider.Plugin, 'd')
    const managed = makeSkill('s', 'body', SkillProvider.Managed, 'd')

    const { kept } = dedupeSkills([harness, plugin, managed])
    expect(kept[0].provider).toBe(SkillProvider.Managed)
  })
})

// ── 4. dedupeSkills — same slug, different content (shadow/collision) ──────

describe('dedupeSkills — same slug, different content', () => {
  it('keeps higher-rank provider version and shadows lower-rank version', () => {
    const managed = makeSkill(
      'skill-x',
      'managed version',
      SkillProvider.Managed,
      'universal',
    )
    const user = makeSkill(
      'skill-x',
      'user override',
      SkillProvider.User,
      'skills',
    )

    // Both have different content — managed wins because rank < user
    const { kept, shadowed } = dedupeSkills([managed, user])
    expect(kept).toHaveLength(1)
    expect(kept[0].provider).toBe(SkillProvider.Managed)
    expect(shadowed).toHaveLength(1)
  })

  it('reports a collision finding when slug collides with different content', () => {
    const project = makeSkill(
      'overlap',
      'project body',
      SkillProvider.Project,
      'skills',
    )
    const user = makeSkill(
      'overlap',
      'user body',
      SkillProvider.User,
      'user-skills',
    )

    const { collisions } = dedupeSkills([project, user])
    expect(collisions).toHaveLength(1)
    expect(collisions[0].slug).toBe('overlap')
    expect(collisions[0].winner.provider).toBe(SkillProvider.Project)
    expect(collisions[0].loser.provider).toBe(SkillProvider.User)
  })

  it('does NOT report a collision when content is identical (pure dedupe, no conflict)', () => {
    const a = makeSkill('same', 'identical', SkillProvider.Project, 'skills')
    const b = makeSkill('same', 'identical', SkillProvider.User, 'skills')

    const { collisions } = dedupeSkills([a, b])
    expect(collisions).toHaveLength(0)
  })
})

// ── 5. dedupeSkills — no duplicates ───────────────────────────────────────

describe('dedupeSkills — no duplicates', () => {
  it('returns all skills unchanged when no slug collisions exist', () => {
    const a = makeSkill('alpha', 'body a', SkillProvider.Managed, 'd')
    const b = makeSkill('beta', 'body b', SkillProvider.Project, 'd')
    const c = makeSkill('gamma', 'body c', SkillProvider.User, 'd')

    const { kept, shadowed, collisions } = dedupeSkills([a, b, c])
    expect(kept).toHaveLength(3)
    expect(shadowed).toHaveLength(0)
    expect(collisions).toHaveLength(0)
  })
})
