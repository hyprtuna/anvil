/**
 * ANV-0106 — LlmAgent unit tests (no network).
 *
 * The LlmAgent class takes its SDK client as a constructor argument,
 * so we can pass a fake client here and exercise every code path —
 * happy path, cost-budget cap, missing API key — without paying a cent.
 */

import { describe, expect, it } from 'vitest'
import type { AgentContext, SkillInput } from './agent.js'
import {
  type AnthropicClient,
  LlmAgent,
  createAgentFromEnv,
} from './llm-agent.js'

const ctx: AgentContext = {
  skillSlug: 'tdd-iron-law',
  maxCallsPerTest: 3,
  maxTokensPerCall: 1024,
}

const input: SkillInput = {
  skillBody: '# Write the failing test first.',
  userPrompt: 'I want to add a feature.',
}

const okResponse = {
  content: [{ type: 'text' as const, text: 'Write a failing test first.' }],
  stop_reason: 'end_turn',
}

const fakeClient = (fn: (req: unknown) => unknown): AnthropicClient => ({
  messages: {
    create: async (req: unknown) => fn(req) as never,
  },
})

describe('LlmAgent', () => {
  it('returns the text response from the SDK', async () => {
    let captured: unknown
    const client = fakeClient((req) => {
      captured = req
      return okResponse
    })
    const agent = new LlmAgent({ client, apiKey: 'sk-test' })

    const out = await agent.generateOutput(input, ctx)

    expect(out.text).toBe('Write a failing test first.')
    expect(out.toolCalls).toEqual([])
    expect(captured).toMatchObject({ max_tokens: ctx.maxTokensPerCall })
  })

  it('aborts after maxCallsPerTest is exceeded across calls on the same agent', async () => {
    const client = fakeClient(() => okResponse)
    const tight: AgentContext = { ...ctx, maxCallsPerTest: 2 }
    const agent = new LlmAgent({ client, apiKey: 'sk-test' })

    await agent.generateOutput(input, tight)
    await agent.generateOutput(input, tight)

    await expect(agent.generateOutput(input, tight)).rejects.toThrow(
      /cost budget exceeded/i,
    )
  })

  it('extracts tool calls from the response content', async () => {
    const client = fakeClient(() => ({
      content: [
        { type: 'text', text: 'I will use a tool.' },
        {
          type: 'tool_use',
          name: 'Read',
          input: { file_path: '/tmp/x.ts' },
        },
      ],
      stop_reason: 'tool_use',
    }))
    const agent = new LlmAgent({ client, apiKey: 'sk-test' })

    const out = await agent.generateOutput(input, ctx)

    expect(out.text).toBe('I will use a tool.')
    expect(out.toolCalls).toEqual([
      { name: 'Read', input: { file_path: '/tmp/x.ts' } },
    ])
  })

  it('throws a clear error if the SDK returns an unexpected shape', async () => {
    const client = fakeClient(() => ({ junk: true }))
    const agent = new LlmAgent({ client, apiKey: 'sk-test' })

    await expect(agent.generateOutput(input, ctx)).rejects.toThrow(
      /unexpected response shape/i,
    )
  })
})

describe('createAgentFromEnv', () => {
  it('returns FakeAgent when ANVIL_E2E_AGENT is unset', async () => {
    const agent = await createAgentFromEnv({
      env: {},
      fakeResponses: new Map(),
    })
    expect(agent.constructor.name).toBe('FakeAgent')
  })

  it('returns FakeAgent when ANVIL_E2E_AGENT=fake', async () => {
    const agent = await createAgentFromEnv({
      env: { ANVIL_E2E_AGENT: 'fake' },
      fakeResponses: new Map(),
    })
    expect(agent.constructor.name).toBe('FakeAgent')
  })

  it('throws when ANVIL_E2E_AGENT=llm but no ANTHROPIC_API_KEY', async () => {
    await expect(
      createAgentFromEnv({
        env: { ANVIL_E2E_AGENT: 'llm' },
        fakeResponses: new Map(),
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })

  it('throws on an unrecognised ANVIL_E2E_AGENT value', async () => {
    await expect(
      createAgentFromEnv({
        env: { ANVIL_E2E_AGENT: 'gpt' },
        fakeResponses: new Map(),
      }),
    ).rejects.toThrow(/ANVIL_E2E_AGENT/)
  })
})
