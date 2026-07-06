/**
 * ANV-0106 -- Pluggable Agent interface for skill end-to-end tests.
 *
 * The Agent abstracts whatever consumes a rendered skill body + user prompt
 * and emits a model response. Two implementations exist:
 *
 *   - FakeAgent -- returns canned outputs from a fixture map. CI default.
 *     Fast, deterministic, zero-cost.
 *   - LlmAgent -- calls the real Anthropic API. Opt-in via
 *     ANVIL_E2E_AGENT=llm. Per-test cost budget enforced.
 *
 * Env-var swap: ANVIL_E2E_AGENT=fake|llm selects the implementation at
 * test setup time via createAgentFromEnv. When unset, FakeAgent is used.
 */

import { createHash } from 'node:crypto'

export interface SkillInput {
  /** The skill body -- markdown after frontmatter, as fed to the model. */
  skillBody: string
  /** The user-facing prompt the agent should react to. */
  userPrompt: string
}

export interface AgentContext {
  /** The skill slug under test, e.g. tdd-iron-law. */
  skillSlug: string
  /** Per-test maximum model calls; LlmAgent aborts when exceeded. */
  maxCallsPerTest: number
  /** Per-call max output tokens; passed straight to the SDK. */
  maxTokensPerCall: number
}

export interface ToolCallRecord {
  name: string
  input: Record<string, unknown>
}

export interface SkillOutput {
  text: string
  toolCalls: ToolCallRecord[]
}

export interface Agent {
  generateOutput(input: SkillInput, ctx: AgentContext): Promise<SkillOutput>
}

export function hashSkillInput(input: SkillInput): string {
  const h = createHash('sha256')
  h.update(input.skillBody)
  h.update(' ')
  h.update(input.userPrompt)
  return h.digest('hex')
}

export class FakeAgent implements Agent {
  private readonly responses: Map<string, SkillOutput>

  constructor(responses: Map<string, SkillOutput>) {
    this.responses = responses
  }

  async generateOutput(
    input: SkillInput,
    _ctx: AgentContext,
  ): Promise<SkillOutput> {
    const key = hashSkillInput(input)
    const found = this.responses.get(key)
    if (!found) {
      throw new Error(
        `FakeAgent: no canned response for input hash ${key.slice(0, 12)}... ` +
          `Add an entry to the fixture map. Prompt was: ${JSON.stringify(input.userPrompt.slice(0, 60))}`,
      )
    }
    return found
  }
}
