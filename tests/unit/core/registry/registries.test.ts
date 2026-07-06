import { describe, expect, it } from 'vitest'
import { AgentRegistry } from '../../../../src/core/registry/agent-registry.js'
import { HookRegistry } from '../../../../src/core/registry/hook-registry.js'
import { SkillRegistry } from '../../../../src/core/registry/skill-registry.js'
import type {
  Agent,
  HookContext,
  HookResult,
  Skill,
} from '../../../../src/core/types.js'

function makeSkill(name: string, tier: Skill['tier']): Skill {
  return {
    frontmatter: {
      name,
      group: 'development',
      description: `${name} skill`,
      trigger: [],
      preferred_model: 'claude-sonnet-4-6',
      preferred_effort: 'medium',
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
    },
    body: `# ${name}`,
    sourcePath: `/skills/universal/${name}.md`,
    tier,
  }
}

function makeAgent(name: string): Agent {
  return {
    frontmatter: {
      name,
      group: 'autonomous',
      description: `${name} agent`,
      trigger: [],
      preferred_model: 'claude-opus-4-6',
      preferred_effort: 'max',
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
      max_turns: 20,
      tier: 3,
    },
    body: `# ${name}`,
    sourcePath: `/agents/${name}.md`,
  }
}

describe('SkillRegistry', () => {
  it('registers and retrieves a skill', () => {
    const r = new SkillRegistry()
    r.register(makeSkill('development', 'universal'))
    expect(r.get('development')).toBeDefined()
  })

  it('language tier overrides universal', () => {
    const r = new SkillRegistry()
    r.register(makeSkill('development', 'universal'))
    const lang = {
      ...makeSkill('development', 'language'),
      body: '# lang version',
    }
    r.register(lang)
    expect(r.get('development')?.body).toBe('# lang version')
  })

  it('user tier overrides language', () => {
    const r = new SkillRegistry()
    r.register(makeSkill('development', 'language'))
    const user = { ...makeSkill('development', 'user'), body: '# user version' }
    r.register(user)
    expect(r.get('development')?.body).toBe('# user version')
  })

  it('universal does not override language', () => {
    const r = new SkillRegistry()
    r.register(makeSkill('development', 'language'))
    r.register(makeSkill('development', 'universal'))
    // language registered first, universal should not override it
    // Actually: language (1) >= universal (0), so if we re-register universal after language it should NOT override
    // Wait - the priority check is: priority[incoming] >= priority[existing]
    // universal=0, language=1. If existing=language(1) and incoming=universal(0): 0 >= 1 = false → don't override ✓
    expect(r.get('development')?.tier).toBe('language')
  })
})

describe('HookRegistry', () => {
  it('registers and dispatches handlers', async () => {
    const r = new HookRegistry()
    const called: string[] = []
    r.register(
      'test-hook',
      'pre-commit',
      async (_ctx: HookContext): Promise<HookResult> => {
        called.push('called')
        return { exitCode: 0 }
      },
    )
    const handlers = r.getHandlers('pre-commit')
    expect(handlers.length).toBe(1)
  })

  it('disabling a hook removes it from dispatch', () => {
    const r = new HookRegistry()
    r.register(
      'test-hook',
      'pre-commit',
      async (): Promise<HookResult> => ({ exitCode: 0 }),
    )
    r.disable('test-hook')
    expect(r.getHandlers('pre-commit').length).toBe(0)
    r.enable('test-hook')
    expect(r.getHandlers('pre-commit').length).toBe(1)
  })
})

describe('AgentRegistry', () => {
  it('registers and retrieves agents', () => {
    const r = new AgentRegistry()
    r.register(makeAgent('orchestrator'))
    expect(r.get('orchestrator')).toBeDefined()
    expect(r.size).toBe(1)
  })
})
