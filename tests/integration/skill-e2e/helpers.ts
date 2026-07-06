/**
 * ANV-0106 — shared scaffolding for skill-e2e tests.
 *
 * Each test declares:
 *   - the skill file to load (path + slug)
 *   - the user prompt
 *   - the canned compliant output (for FakeAgent)
 *   - behavioral assertions on the output text
 *
 * `runSkillE2E` plumbs those through createAgentFromEnv, so the same
 * test runs against FakeAgent in CI and against LlmAgent on the
 * nightly track (when ANVIL_E2E_AGENT=llm + ANTHROPIC_API_KEY are set).
 */

import { expect } from 'vitest'
import type { Agent, SkillOutput } from './agent.js'
import { hashSkillInput } from './agent.js'
import { createAgentFromEnv } from './llm-agent.js'
import { type SkillFileRef, loadSkillBody } from './load-skill.js'

export interface SkillE2ECase {
  /** Display slug used for cost-budget attribution + error messages. */
  slug: string
  /** File on disk that holds the skill body. */
  file: SkillFileRef
  /** User prompt the agent reacts to. */
  userPrompt: string
  /** Canned compliant text used by FakeAgent. */
  fakeOutputText: string
  /**
   * Per-case behavioral assertions on the output text. Each predicate
   * must hold against both the fake and the real LLM output.
   */
  assertions: ReadonlyArray<{
    label: string
    predicate: (text: string) => boolean
  }>
}

export async function runSkillE2E(
  testCase: SkillE2ECase,
): Promise<SkillOutput> {
  const skillBody = await loadSkillBody(testCase.file)
  const input = { skillBody, userPrompt: testCase.userPrompt }

  const fakeOutput: SkillOutput = {
    text: testCase.fakeOutputText,
    toolCalls: [],
  }
  const fakeResponses = new Map<string, SkillOutput>()
  fakeResponses.set(hashSkillInput(input), fakeOutput)

  const agent: Agent = await createAgentFromEnv({
    env: process.env,
    fakeResponses,
  })

  const out = await agent.generateOutput(input, {
    skillSlug: testCase.slug,
    maxCallsPerTest: 3,
    maxTokensPerCall: 4000,
  })

  for (const { label, predicate } of testCase.assertions) {
    expect(predicate(out.text), `assertion failed: ${label}`).toBe(true)
  }
  return out
}
