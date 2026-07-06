import { describe, expect, it } from 'vitest'
import {
  HEADLESS_MODE_BANNER,
  HEADLESS_TOOL_DENYLIST,
  assertHeadlessToolAllowed,
  prepareInvocation,
} from '../../../src/agents/runner.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { AgentRegistry } from '../../../src/core/registry/agent-registry.js'
import type { Agent, RoutingDecision } from '../../../src/core/types.js'

function makeAgent(name: string, tools: string[] = ['Read']): Agent {
  return {
    frontmatter: {
      name,
      group: 'planning',
      description: name,
      trigger: [],
      preferred_model: 'claude-opus-4-6',
      preferred_effort: 'high',
      inputs: [],
      outputs: [],
      tools,
      chains: [],
      language: 'universal',
      max_turns: 20,
      tier: 2,
    },
    body: `# ${name}\n\nAgent body.`,
    sourcePath: `/agents/${name}.md`,
  }
}

describe('agents/runner', () => {
  it('prepares an invocation for a registered agent', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('orchestrator', ['Read', 'Task']))
    const invocation = prepareInvocation(
      reg,
      buildDefaultConfig(),
      'orchestrator',
      'dispatch subtasks',
    )
    expect(invocation.tools).toEqual(['Read', 'Task'])
    expect(invocation.prompt).toContain('# orchestrator')
    expect(invocation.prompt).toContain('dispatch subtasks')
    expect(invocation.resolvedModel.model).toBeTruthy()
  })

  it('throws on unknown agent', () => {
    const reg = new AgentRegistry()
    expect(() =>
      prepareInvocation(reg, buildDefaultConfig(), 'nope', 'x'),
    ).toThrow(/not found/)
  })

  it('renders a [routing] preamble when a RoutingDecision is supplied (T2.8)', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('ultra-worker'))
    const routing: RoutingDecision = {
      intent: 'debug',
      confidence: 0.85,
      agent: 'ultra-worker',
      mode: 'single',
      skills: ['debugging', 'silent-failure-hunter'],
      rules: {
        prompt: ['evidence-before-assertion'],
        execution: ['verification-before-completion'],
        safety: [],
        workflow: [],
      },
      secondaryIntents: [],
      candidates: [],
    }
    const invocation = prepareInvocation(
      reg,
      buildDefaultConfig(),
      'ultra-worker',
      'fix the flaky test',
      { routingDecision: routing },
    )
    expect(invocation.prompt).toContain('[routing]')
    expect(invocation.prompt).toContain('intent=debug')
    expect(invocation.prompt).toContain(
      'skills=debugging, silent-failure-hunter',
    )
    expect(invocation.prompt).toContain(
      'rules.prompt=evidence-before-assertion',
    )
    expect(invocation.prompt).toContain(
      'rules.execution=verification-before-completion',
    )
    expect(invocation.routingDecision).toEqual(routing)
  })

  describe('headless tool denylist', () => {
    it('allows tools not on the denylist', () => {
      expect(() => assertHeadlessToolAllowed('Read')).not.toThrow()
      expect(() => assertHeadlessToolAllowed('Bash')).not.toThrow()
    })

    it.each(HEADLESS_TOOL_DENYLIST)(
      'rejects denied tool %s with an error',
      (tool) => {
        expect(() => assertHeadlessToolAllowed(tool)).toThrow(
          /denied in CI\/headless mode/,
        )
      },
    )

    it('includes all denied tools in the HEADLESS_MODE_BANNER', () => {
      for (const tool of HEADLESS_TOOL_DENYLIST) {
        expect(HEADLESS_MODE_BANNER).toContain(tool)
      }
    })
  })

  it('omits the [routing] preamble when no RoutingDecision is supplied', () => {
    const reg = new AgentRegistry()
    reg.register(makeAgent('ultra-worker'))
    const invocation = prepareInvocation(
      reg,
      buildDefaultConfig(),
      'ultra-worker',
      'x',
    )
    expect(invocation.prompt).not.toContain('[routing]')
    expect(invocation.routingDecision).toBeUndefined()
  })
})
