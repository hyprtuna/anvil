/**
 * Plan 38 Phase D — Sub-D3 test:
 * `prepareInvocation({dispatchTierContext: {tier: 'quick'}})` forwards `tier: 'quick'`
 * into the resolver call; resolved model is Haiku.
 */
import { describe, expect, it } from 'vitest'
import { prepareInvocation } from '../../../src/agents/runner.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { AgentRegistry } from '../../../src/core/registry/agent-registry.js'
import type { Agent } from '../../../src/core/types.js'

function makeAgent(name: string): Agent {
  return {
    frontmatter: {
      name,
      group: 'planning',
      description: name,
      trigger: [],
      preferred_model: 'claude-opus-4-7',
      preferred_effort: 'high',
      inputs: [],
      outputs: [],
      tools: ['Read'],
      chains: [],
      language: 'universal',
      max_turns: 20,
      tier: 2,
    },
    body: `# ${name}\n\nAgent body.`,
    sourcePath: `/agents/${name}.md`,
  }
}

describe('runner.prepareInvocation — dispatchTierContext (Plan 38 Phase D)', () => {
  const config = buildDefaultConfig()

  it('dispatchTierContext.tier=quick resolves to claude-haiku-4-5', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('code-explorer'))
    const inv = prepareInvocation(
      reg,
      config,
      'code-explorer',
      'explore the codebase',
      { dispatchTierContext: { tier: 'quick' } },
    )
    expect(inv.resolvedModel.model).toBe('claude-haiku-4-5')
    expect(inv.resolvedModel.source).toBe('cli-tier')
  })

  it('dispatchTierContext.tier=ultra resolves to claude-opus-4-7 + xhigh', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('code-reviewer'))
    const inv = prepareInvocation(
      reg,
      config,
      'code-reviewer',
      'review the code',
      { dispatchTierContext: { tier: 'ultra' } },
    )
    expect(inv.resolvedModel.model).toBe('claude-opus-4-7')
    expect(inv.resolvedModel.effort).toBe('xhigh')
    expect(inv.resolvedModel.source).toBe('cli-tier')
  })

  it('dispatchTierContext.tier=coding resolves to claude-sonnet-4-6', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('subagent-executor'))
    const inv = prepareInvocation(
      reg,
      config,
      'subagent-executor',
      'implement the feature',
      { dispatchTierContext: { tier: 'coding' } },
    )
    expect(inv.resolvedModel.model).toBe('claude-sonnet-4-6')
    expect(inv.resolvedModel.source).toBe('cli-tier')
  })

  it('without dispatchTierContext, uses normal resolution (agent config)', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('ultra-worker'))
    const inv = prepareInvocation(
      reg,
      config,
      'ultra-worker',
      'autonomous task',
    )
    // ultra-worker has agents['ultra-worker'] = { tier: 'ultra' } in defaults
    expect(inv.resolvedModel.model).toBe('claude-opus-4-7')
    expect(inv.resolvedModel.source).toBe('tier')
  })

  it('dispatchTierContext.tier=undefined falls back to normal resolution', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('ultra-worker'))
    const inv = prepareInvocation(
      reg,
      config,
      'ultra-worker',
      'autonomous task',
      { dispatchTierContext: { tier: undefined } },
    )
    // No tier override → falls through to agent config (tier=ultra)
    expect(inv.resolvedModel.model).toBe('claude-opus-4-7')
    expect(inv.resolvedModel.source).toBe('tier')
  })

  it('prompt still contains agent body and user prompt when tier is injected', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('code-explorer'))
    const inv = prepareInvocation(
      reg,
      config,
      'code-explorer',
      'find the entrypoint',
      { dispatchTierContext: { tier: 'quick' } },
    )
    expect(inv.prompt).toContain('# code-explorer')
    expect(inv.prompt).toContain('find the entrypoint')
  })
})
