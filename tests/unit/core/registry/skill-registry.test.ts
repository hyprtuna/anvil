import { describe, expect, it } from 'vitest'
import { SkillRegistry } from '../../../../src/core/registry/skill-registry.js'
import type { Skill } from '../../../../src/core/types.js'

function makeSkill(name: string, extras: Partial<Skill> = {}): Skill {
  const base: Skill = {
    frontmatter: {
      name,
      kind: 'atomic',
      group: 'development',
      description: `${name} description`,
      trigger: [],
      preferred_model: 'claude-sonnet-4-6',
      preferred_effort: 'medium',
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
    },
    body: 'body',
    sourcePath: `/tmp/${name}.md`,
    tier: 'universal',
    ...extras,
  }
  return base
}

describe('core/registry/SkillRegistry', () => {
  it('list() returns the same set as getAll()', () => {
    const reg = new SkillRegistry()
    reg.register(makeSkill('a'))
    reg.register(makeSkill('b'))
    expect(
      reg
        .list()
        .map((s) => s.frontmatter.name)
        .sort(),
    ).toEqual(['a', 'b'])
    expect(reg.list()).toEqual(reg.getAll())
  })

  it('resolve() returns the skill when present', () => {
    const reg = new SkillRegistry()
    reg.register(makeSkill('planning'))
    expect(reg.resolve('planning').frontmatter.name).toBe('planning')
  })

  it('resolve() throws on unknown skill', () => {
    const reg = new SkillRegistry()
    expect(() => reg.resolve('nope')).toThrow(/Skill not found: nope/)
  })

  it('chain() walks chains[].after transitively and breaks cycles', () => {
    const reg = new SkillRegistry()
    reg.register(
      makeSkill('a', {
        frontmatter: {
          ...makeSkill('a').frontmatter,
          chains: [{ after: 'b' }],
        },
      }),
    )
    reg.register(
      makeSkill('b', {
        frontmatter: {
          ...makeSkill('b').frontmatter,
          chains: [{ after: 'c' }],
        },
      }),
    )
    reg.register(
      makeSkill('c', {
        frontmatter: {
          ...makeSkill('c').frontmatter,
          chains: [{ after: 'a' }],
        },
      }),
    ) // cycle
    const names = reg.chain('a').map((s) => s.frontmatter.name)
    expect(names).toEqual(['a', 'b', 'c'])
  })

  it('chain() returns just the starting skill when no chain links exist', () => {
    const reg = new SkillRegistry()
    reg.register(makeSkill('solo'))
    expect(reg.chain('solo').map((s) => s.frontmatter.name)).toEqual(['solo'])
  })

  it('validate() reports no failures for clean registry', () => {
    const reg = new SkillRegistry()
    reg.register(makeSkill('a'))
    expect(reg.validate()).toEqual([])
  })

  it('validate() reports failures when frontmatter is corrupted at runtime', () => {
    const reg = new SkillRegistry()
    const broken = makeSkill('broken')
    // Intentionally corrupt the frozen frontmatter to simulate a runtime mutation.
    ;(broken.frontmatter as unknown as { name: string }).name = ''
    reg.register(broken)
    // Read back with a different key; register stores by name so need a clean path
    // — use direct Map access via getAll (the registry captured the now-empty name
    // as key on registration, so validate() should still flag it).
    const failures = reg.validate()
    expect(failures.length).toBe(1)
    expect(failures[0].issues.some((i) => i.includes('name'))).toBe(true)
  })
})
