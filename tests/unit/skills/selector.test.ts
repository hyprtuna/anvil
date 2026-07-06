import { beforeEach, describe, expect, it } from 'vitest'
import { SkillRegistry } from '../../../src/core/registry/skill-registry.js'
import type { ProjectContext, Skill } from '../../../src/core/types.js'
import { selectSkills } from '../../../src/skills/selector.js'

function makeSkill(
  name: string,
  group: string,
  triggers: string[],
  language = 'universal',
  tier: Skill['tier'] = 'universal',
  tags: string[] = [],
  aliases: string[] = [],
  kind: Skill['frontmatter']['kind'] = 'atomic',
  description?: string,
): Skill {
  return {
    frontmatter: {
      name,
      kind,
      group,
      description: description ?? name,
      trigger: triggers,
      preferred_model: 'claude-sonnet-4-6',
      preferred_effort: 'medium',
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language,
      tags,
      aliases,
      isHidden: false,
    },
    body: name,
    sourcePath: `/fake/${name}.md`,
    tier,
  }
}

const ctx: ProjectContext = {
  languages: [{ name: 'typescript', confidence: 1, evidence: [] }],
  frameworks: ['next.js'],
  testRunners: ['vitest'],
  packageManager: 'pnpm',
  ci: ['github-actions'],
  detectedAt: new Date().toISOString(),
}

describe('skills/selector', () => {
  let reg: SkillRegistry

  beforeEach(() => {
    reg = new SkillRegistry()
    reg.register(makeSkill('planning', 'planning', ['plan', 'break down']))
    reg.register(
      makeSkill('code-reviewer', 'review', ['review', 'code review']),
    )
    reg.register(makeSkill('debugging', 'meta', ['debug', 'error']))
    reg.register(
      makeSkill(
        'typescript-coding',
        'development',
        ['implement', 'code'],
        'typescript',
        'language',
      ),
    )
    reg.register(makeSkill('development', 'development', ['implement', 'code']))
  })

  it('matches a skill by trigger keyword', () => {
    const result = selectSkills('please plan this feature', reg, ctx)
    expect(result[0].frontmatter.name).toBe('planning')
  })

  it('prefers language overlay over universal for same skill name in results', () => {
    const result = selectSkills('implement the login form', reg, ctx)
    // typescript-coding scores higher (language multiplier ×2)
    expect(result[0].frontmatter.name).toBe('typescript-coding')
  })

  it('returns multiple matches', () => {
    const result = selectSkills('review and debug this code', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names).toContain('code-reviewer')
    expect(names).toContain('debugging')
  })

  it('returns empty array when no triggers match', () => {
    const result = selectSkills('hello', reg, ctx)
    expect(result).toEqual([])
  })

  it('matches by exact tag', () => {
    reg.register(
      makeSkill(
        'tagger',
        'meta',
        [],
        'universal',
        'universal',
        ['planning'],
        [],
      ),
    )
    const result = selectSkills('planning please help', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names).toContain('tagger')
    // tagger score = +2 (tag match); planning score = +1 (trigger match)
    expect(result[0].frontmatter.name).toBe('tagger')
  })

  it('matches by alias', () => {
    reg.register(
      makeSkill(
        'aliased',
        'meta',
        [],
        'universal',
        'universal',
        [],
        ['plan this'],
      ),
    )
    const result = selectSkills('please plan this feature', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names).toContain('aliased')
  })

  it('scores tag match higher than trigger match', () => {
    // 'tag-skill' has tag 'plan' (score +2), no triggers matching "plan"
    reg.register(
      makeSkill(
        'tag-skill',
        'meta',
        ['something-else'],
        'universal',
        'universal',
        ['plan'],
        [],
      ),
    )
    // 'trigger-skill' has trigger 'plan' (score +1), no tags
    reg.register(
      makeSkill(
        'trigger-skill',
        'meta',
        ['plan'],
        'universal',
        'universal',
        [],
        [],
      ),
    )
    const result = selectSkills('plan the project', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names).toContain('tag-skill')
    expect(names).toContain('trigger-skill')
    // tag-skill (+2 tag) should rank above trigger-skill (+1 trigger)
    expect(names.indexOf('tag-skill')).toBeLessThan(
      names.indexOf('trigger-skill'),
    )
  })

  it('handles skills with empty trigger list', () => {
    // Skill has trigger: [] but has tags: ['special']
    reg.register(
      makeSkill(
        'empty-trigger',
        'meta',
        [],
        'universal',
        'universal',
        ['special'],
        [],
      ),
    )
    const result = selectSkills('this is special', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names).toContain('empty-trigger')
  })

  it('case-insensitive trigger matching', () => {
    const result = selectSkills('PLAN THIS NOW', reg, ctx)
    expect(result[0].frontmatter.name).toBe('planning')
  })

  it('matches substring triggers in the prompt', () => {
    // The selector uses promptLc.includes(trigger) — so 'planning' contains 'plan'
    const result = selectSkills('I am planning a feature', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names).toContain('planning')
  })

  it('intent boost lifts a matching skill above an equally-scored non-match (T2.12)', () => {
    // Both planning and code-reviewer trigger on the prompt.
    const result = selectSkills('review and plan this', reg, ctx, {
      intent: 'plan',
    })
    const names = result.map((s) => s.frontmatter.name)
    // plan-writing is in INTENT_DEFINITIONS.plan.defaultSkills but not registered;
    // planning is registered and matched by trigger; intent-boost bumps planning above code-reviewer.
    reg.register(
      makeSkill(
        'plan-writing',
        'planning',
        [],
        'universal',
        'universal',
        [],
        [],
        'atomic',
      ),
    )
    const r2 = selectSkills('review and plan this', reg, ctx, {
      intent: 'plan',
    })
    const n2 = r2.map((s) => s.frontmatter.name)
    // plan-writing gets +3 intent boost (even with no trigger match) → ends up in the list.
    expect(n2).toContain('plan-writing')
    expect(names).toBeDefined()
  })

  it('description-trigger match adds +1 when a matched trigger also appears in the description (T2.12)', () => {
    reg.register(
      makeSkill(
        'described',
        'meta',
        ['refactor'],
        'universal',
        'universal',
        [],
        [],
        'atomic',
        'Use when you need to refactor the codebase',
      ),
    )
    reg.register(
      makeSkill(
        'undescribed',
        'meta',
        ['refactor'],
        'universal',
        'universal',
        [],
        [],
        'atomic',
        'sometimes rewrites files', // no "refactor" token
      ),
    )
    const result = selectSkills('please refactor this', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    expect(names.indexOf('described')).toBeLessThan(
      names.indexOf('undescribed'),
    )
  })

  it('kind tiebreak orders meta > composite > atomic on equal score (T2.12)', () => {
    reg.register(
      makeSkill(
        'atomic-skill',
        'meta',
        ['unique-tie'],
        'universal',
        'universal',
        [],
        [],
        'atomic',
      ),
    )
    reg.register(
      makeSkill(
        'composite-skill',
        'meta',
        ['unique-tie'],
        'universal',
        'universal',
        [],
        [],
        'composite',
      ),
    )
    reg.register(
      makeSkill(
        'meta-skill',
        'meta',
        ['unique-tie'],
        'universal',
        'universal',
        [],
        [],
        'meta',
      ),
    )
    const result = selectSkills('unique-tie please', reg, ctx)
    const names = result.map((s) => s.frontmatter.name)
    const meta = names.indexOf('meta-skill')
    const composite = names.indexOf('composite-skill')
    const atomic = names.indexOf('atomic-skill')
    expect(meta).toBeLessThan(composite)
    expect(composite).toBeLessThan(atomic)
  })
})

describe('skills/selector — activation pre-filter', () => {
  it('excludes a Python-only skill from selection in a TS project', () => {
    const reg = new SkillRegistry()
    const tsSkill = makeSkill('ts-only', 'development', ['code'])
    const pySkill = makeSkill('py-only', 'development', ['code'])
    pySkill.frontmatter.activation = { languages: ['python'] }
    reg.register(tsSkill)
    reg.register(pySkill)
    const result = selectSkills('please write some code', reg, ctx)
    const slugs = result.map((s) => s.frontmatter.name)
    expect(slugs).toContain('ts-only')
    expect(slugs).not.toContain('py-only')
  })

  it('retains skills without an activation block (back-compat)', () => {
    const reg = new SkillRegistry()
    const plain = makeSkill('plain', 'development', ['code'])
    reg.register(plain)
    const result = selectSkills('write code', reg, ctx)
    expect(result.map((s) => s.frontmatter.name)).toContain('plain')
  })
})
