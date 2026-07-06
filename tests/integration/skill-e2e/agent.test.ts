/**
 * ANV-0106 — Agent interface + FakeAgent unit tests.
 *
 * Verifies:
 * - The Agent interface is a single-method contract.
 * - FakeAgent returns canned outputs for known input hashes.
 * - FakeAgent throws a clear error for unknown inputs (no silent fallback).
 *
 * No LLM calls. No network. Pure determinism.
 */

import { describe, expect, it } from 'vitest'
import {
  type AgentContext,
  FakeAgent,
  type SkillInput,
  type SkillOutput,
  hashSkillInput,
} from './agent.js'

const ctx: AgentContext = {
  skillSlug: 'test-skill',
  maxCallsPerTest: 3,
  maxTokensPerCall: 4000,
}

const input: SkillInput = {
  skillBody: '# rule: always write the test first',
  userPrompt: 'I want to add a feature.',
}

const cannedOutput: SkillOutput = {
  text: 'You must write a failing test before implementation.',
  toolCalls: [],
}

describe('FakeAgent', () => {
  it('returns the canned output keyed by input hash', async () => {
    const responses = new Map<string, SkillOutput>()
    responses.set(hashSkillInput(input), cannedOutput)
    const agent = new FakeAgent(responses)

    const result = await agent.generateOutput(input, ctx)

    expect(result).toEqual(cannedOutput)
  })

  it('throws a clear error for an unknown input hash', async () => {
    const agent = new FakeAgent(new Map())

    await expect(agent.generateOutput(input, ctx)).rejects.toThrow(
      /FakeAgent: no canned response/,
    )
  })

  it('hashSkillInput is deterministic for the same input', () => {
    const a = hashSkillInput(input)
    const b = hashSkillInput({ ...input })
    expect(a).toBe(b)
  })

  it('hashSkillInput differs for different inputs', () => {
    const a = hashSkillInput(input)
    const b = hashSkillInput({ ...input, userPrompt: 'different' })
    expect(a).not.toBe(b)
  })
})
