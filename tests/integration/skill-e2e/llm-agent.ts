/**
 * ANV-0106 — LlmAgent: opt-in real-LLM implementation of the Agent
 * interface.
 *
 * Design choices:
 *
 * 1. **Dependency injection.** The Anthropic SDK client is a constructor
 *    argument, not a singleton imported here. Tests pass a fake client
 *    and exercise every branch without paying for tokens.
 *
 * 2. **Cost budget.** Each agent instance keeps an internal counter of
 *    completed calls. When `maxCallsPerTest` from the context is
 *    exceeded, the next call throws "cost budget exceeded" rather than
 *    silently racking up the bill. This is a per-agent fence; tests are
 *    expected to construct one agent per test.
 *
 * 3. **Env-var gating.** `createAgentFromEnv` is the only place that
 *    actually instantiates an Anthropic client at runtime. When
 *    `ANVIL_E2E_AGENT` is unset or set to `fake`, no SDK is loaded and
 *    no key is required. This keeps `bun test` in the default config
 *    completely network-free.
 *
 * 4. **No SDK dependency on disk.** We don't `import '@anthropic-ai/sdk'`
 *    statically — see `loadAnthropicClient` for the dynamic import. That
 *    makes the SDK an optional dependency; tests run in environments
 *    where it isn't installed.
 *
 * 5. **Zod parsing of the response.** The SDK return shape is a moving
 *    target across versions; we validate the bits we care about and
 *    refuse to guess about the rest.
 */

import { z } from 'zod'
import {
  type Agent,
  type AgentContext,
  FakeAgent,
  type SkillInput,
  type SkillOutput,
  type ToolCallRecord,
} from './agent.js'

/**
 * The minimal slice of the Anthropic SDK we depend on. Declaring it
 * structurally (rather than `import type { Anthropic }`) keeps the SDK
 * an optional dependency at install time — only LLM-track CI needs it.
 */
export interface AnthropicClient {
  messages: {
    create: (req: AnthropicMessageRequest) => Promise<AnthropicMessageResponse>
  }
}

export interface AnthropicMessageRequest {
  model?: string
  max_tokens: number
  system?: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

// The SDK's response shape is permissive at the TS level; we treat it as
// unknown and validate via Zod below.
export type AnthropicMessageResponse = unknown

const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})
const ToolUseBlockSchema = z.object({
  type: z.literal('tool_use'),
  name: z.string(),
  input: z.record(z.unknown()),
})
const ContentBlockSchema = z.union([TextBlockSchema, ToolUseBlockSchema])
const ResponseSchema = z.object({
  content: z.array(ContentBlockSchema),
  stop_reason: z.string().optional(),
})

export interface LlmAgentOptions {
  client: AnthropicClient
  apiKey: string
  /** Defaults to claude-sonnet — overridable for cost tuning. */
  model?: string
}

export class LlmAgent implements Agent {
  private readonly client: AnthropicClient
  private readonly model: string
  private callCount = 0

  constructor(opts: LlmAgentOptions) {
    if (!opts.apiKey) {
      throw new Error(
        'LlmAgent: ANTHROPIC_API_KEY is required. Set it in the env or use FakeAgent.',
      )
    }
    this.client = opts.client
    this.model = opts.model ?? 'claude-sonnet-4-5'
  }

  async generateOutput(
    input: SkillInput,
    ctx: AgentContext,
  ): Promise<SkillOutput> {
    if (this.callCount >= ctx.maxCallsPerTest) {
      throw new Error(
        `LlmAgent: cost budget exceeded for skill "${ctx.skillSlug}" ` +
          `(maxCallsPerTest=${ctx.maxCallsPerTest}). Aborting before further spend.`,
      )
    }
    this.callCount += 1

    const raw = await this.client.messages.create({
      model: this.model,
      max_tokens: ctx.maxTokensPerCall,
      system: input.skillBody,
      messages: [{ role: 'user', content: input.userPrompt }],
    })

    const parsed = ResponseSchema.safeParse(raw)
    if (!parsed.success) {
      throw new Error(
        `LlmAgent: unexpected response shape from Anthropic SDK: ${parsed.error.message}`,
      )
    }

    const text = parsed.data.content
      .filter((b): b is z.infer<typeof TextBlockSchema> => b.type === 'text')
      .map((b) => b.text)
      .join('\n')

    const toolCalls: ToolCallRecord[] = parsed.data.content
      .filter(
        (b): b is z.infer<typeof ToolUseBlockSchema> => b.type === 'tool_use',
      )
      .map((b) => ({ name: b.name, input: b.input }))

    return { text, toolCalls }
  }
}

/**
 * Dynamic import of the Anthropic SDK. Only called when
 * `ANVIL_E2E_AGENT=llm`. Keeps the SDK an optional dependency.
 */
async function loadAnthropicClient(apiKey: string): Promise<AnthropicClient> {
  // The SDK isn't part of Anvil's dependencies — install it only when
  // running the llm track: `bun add -D @anthropic-ai/sdk`.
  // We import dynamically so static checkers and the default test run
  // never need it on disk.
  const moduleName = '@anthropic-ai/sdk'
  let mod: { default?: new (opts: { apiKey: string }) => AnthropicClient } & {
    Anthropic?: new (opts: { apiKey: string }) => AnthropicClient
  }
  try {
    mod = (await import(/* @vite-ignore */ moduleName)) as typeof mod
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `LlmAgent: failed to load @anthropic-ai/sdk. Install it with \`bun add -D @anthropic-ai/sdk\` to run the llm track. (${detail})`,
    )
  }
  const Ctor = mod.default ?? mod.Anthropic
  if (!Ctor) {
    throw new Error('LlmAgent: @anthropic-ai/sdk did not export a constructor.')
  }
  return new Ctor({ apiKey })
}

export interface CreateAgentFromEnvOptions {
  env: Record<string, string | undefined>
  fakeResponses: Map<string, SkillOutput>
  /** Overridable client factory — tests inject a fake client here. */
  clientFactory?: (apiKey: string) => Promise<AnthropicClient>
}

/**
 * Reads `ANVIL_E2E_AGENT` from the supplied env and returns the right
 * implementation. `fake` (or unset) → FakeAgent. `llm` → LlmAgent with
 * a real SDK client (or the injected one). Anything else throws.
 */
export async function createAgentFromEnv(
  opts: CreateAgentFromEnvOptions,
): Promise<Agent> {
  const mode = opts.env.ANVIL_E2E_AGENT ?? 'fake'
  if (mode === 'fake') {
    return new FakeAgent(opts.fakeResponses)
  }
  if (mode === 'llm') {
    const apiKey = opts.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error(
        'createAgentFromEnv: ANVIL_E2E_AGENT=llm but ANTHROPIC_API_KEY is unset. ' +
          'Set the key or run the default (fake) track.',
      )
    }
    const factory = opts.clientFactory ?? loadAnthropicClient
    const client = await factory(apiKey)
    return new LlmAgent({ client, apiKey })
  }
  throw new Error(
    `createAgentFromEnv: unrecognised ANVIL_E2E_AGENT="${mode}". Allowed: "fake" | "llm".`,
  )
}
