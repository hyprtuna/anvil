/**
 * Plan 38 Phase D — Sub-D3 integration test:
 * Orchestrator dispatches two fake subagents (one with tier=quick, one with tier=review);
 * each resolves to its own model.
 */
import { describe, expect, it } from 'vitest'
import { prepareInvocation } from '../../../src/agents/runner.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { AgentRegistry } from '../../../src/core/registry/agent-registry.js'
import type { Agent } from '../../../src/core/types.js'

function makeAgent(name: string, tier = 2): Agent {
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
      tier,
    },
    body: `# ${name}\n\nAgent body for ${name}.`,
    sourcePath: `/agents/${name}.md`,
  }
}

describe('integration: orchestrator mixed-tier dispatch (Plan 38 Phase D)', () => {
  const config = buildDefaultConfig()

  it('orchestrator at planning tier dispatches code-explorer at quick and code-reviewer at review', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('orchestrator'))
    reg.register(makeAgent('code-explorer'))
    reg.register(makeAgent('code-reviewer'))

    // Orchestrator itself (planning tier from config.agents.orchestrator)
    const orchestratorInv = prepareInvocation(
      reg,
      config,
      'orchestrator',
      'analyze and review feature X',
    )
    expect(orchestratorInv.resolvedModel.model).toBe('claude-opus-4-7')
    expect(orchestratorInv.resolvedModel.source).toBe('tier') // from config.agents.orchestrator

    // Subagent 1: code-explorer at quick (cheap read-only exploration)
    const explorerInv = prepareInvocation(
      reg,
      config,
      'code-explorer',
      'find all entry points',
      { dispatchTierContext: { tier: 'quick' } },
    )
    expect(explorerInv.resolvedModel.model).toBe('claude-haiku-4-5')
    expect(explorerInv.resolvedModel.source).toBe('cli-tier')

    // Subagent 2: code-reviewer at review (verification gate)
    const reviewerInv = prepareInvocation(
      reg,
      config,
      'code-reviewer',
      'verify the implementation',
      { dispatchTierContext: { tier: 'review' } },
    )
    expect(reviewerInv.resolvedModel.model).toBe('claude-sonnet-4-6')
    expect(reviewerInv.resolvedModel.effort).toBe('high')
    expect(reviewerInv.resolvedModel.source).toBe('cli-tier')

    // The two subagents resolved to different models — this is the key assertion
    expect(explorerInv.resolvedModel.model).not.toBe(
      reviewerInv.resolvedModel.model,
    )
  })

  it('each subagent invocation is independent — tier context does not leak', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('code-explorer'))
    reg.register(makeAgent('code-reviewer'))

    const inv1 = prepareInvocation(reg, config, 'code-explorer', 'task A', {
      dispatchTierContext: { tier: 'quick' },
    })
    const inv2 = prepareInvocation(reg, config, 'code-reviewer', 'task B', {
      dispatchTierContext: { tier: 'ultra' },
    })

    // Both resolve to their own tiers — no cross-contamination
    expect(inv1.resolvedModel.model).toBe('claude-haiku-4-5')
    expect(inv2.resolvedModel.model).toBe('claude-opus-4-7')
    expect(inv2.resolvedModel.effort).toBe('xhigh')
  })

  it('subagent at coding tier resolves to sonnet for implementation work', () => {
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
    expect(inv.resolvedModel.effort).toBe('medium')
    expect(inv.resolvedModel.source).toBe('cli-tier')
  })
})
