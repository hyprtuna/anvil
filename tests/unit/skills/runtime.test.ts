import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { SkillRegistry } from '../../../src/core/registry/skill-registry.js'
import type { ProjectContext, Skill } from '../../../src/core/types.js'
import { prepareSkillInvocation } from '../../../src/skills/runtime.js'

function makeSkill(name: string): Skill {
  return {
    frontmatter: {
      name,
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
    },
    body: 'body',
    sourcePath: `/tmp/${name}.md`,
    tier: 'universal',
  }
}

const ctx: ProjectContext = {
  languages: [],
  frameworks: [],
  testRunners: [],
  ci: [],
  detectedAt: new Date().toISOString(),
}

describe('skills/runtime', () => {
  const config = buildDefaultConfig()
  const registry = new SkillRegistry()
  registry.register(makeSkill('planning'))
  registry.register(makeSkill('unknown-skill'))
  registry.register(makeSkill('ultra-worker'))

  it('returns undefined for an unregistered skill', () => {
    expect(
      prepareSkillInvocation('nope', 'prompt', registry, config, ctx),
    ).toBeUndefined()
  })

  it('resolves via the group layer for a planning skill', () => {
    const inv = prepareSkillInvocation(
      'planning',
      'plan this',
      registry,
      config,
      ctx,
    )
    expect(inv?.skill.frontmatter.name).toBe('planning')
    expect(inv?.source).toBe('group')
    expect(inv?.model).toBe('claude-opus-4-7')
    expect(inv?.effort).toBe('high')
    expect(inv?.prompt).toBe('plan this')
  })

  it('resolves ultra-worker via tier:ultra (Plan 38 Phase C — tier layer supersedes overrides)', () => {
    // Phase C adds agents['ultra-worker'] = { tier: 'ultra' } → resolves at layer 5 (tier)
    // The 'ultra' tier resolves to {model: claude-opus-4-7, effort: xhigh}.
    // max_tokens comes from defaults (8192) since tier resolution does not carry max_tokens.
    const inv = prepareSkillInvocation(
      'ultra-worker',
      '',
      registry,
      config,
      ctx,
    )
    expect(inv?.source).toBe('tier')
    expect(inv?.model).toBe('claude-opus-4-7')
    expect(inv?.effort).toBe('xhigh')
  })

  it('honors CLI overrides passed via resolveOpts', () => {
    const inv = prepareSkillInvocation('planning', '', registry, config, ctx, {
      cli: { model: 'claude-haiku-4-5', effort: 'low' },
    })
    expect(inv?.source).toBe('cli')
    expect(inv?.model).toBe('claude-haiku-4-5')
    // Plan 38 Phase A: Haiku does not accept effort; effort is clamped to undefined
    expect(inv?.effort).toBeUndefined()
  })

  it('honors ENV overrides', () => {
    const inv = prepareSkillInvocation('planning', '', registry, config, ctx, {
      env: { ANVIL_MODEL: 'claude-sonnet-4-6', ANVIL_EFFORT: 'high' },
    })
    expect(inv?.source).toBe('env')
    expect(inv?.model).toBe('claude-sonnet-4-6')
    expect(inv?.effort).toBe('high')
  })
})
