# Skill End-to-End Test Harness

The skill-e2e harness verifies that Anvil's skills produce the expected
behavior when fed to a real or simulated language model. It lives under
`tests/integration/skill-e2e/` and runs as part of the standard test
suite (with a fake agent) plus a nightly LLM track (against the real
Anthropic API).

## Why

Skills are markdown files that ship as system prompts to the model.
Snapshot tests verify that frontmatter and structure are intact, but
they say nothing about whether a skill, when injected into a real
conversation, steers the model the way we intend. The skill-e2e
harness closes that gap.

## The interface

A single method:

```ts
export interface Agent {
  generateOutput(input: SkillInput, ctx: AgentContext): Promise<SkillOutput>
}
```

- `SkillInput` carries the rendered skill body (markdown after
  frontmatter is stripped) and the user prompt.
- `AgentContext` carries the skill slug and the per-test cost knobs.
- `SkillOutput` is the response text plus any tool calls the model
  emitted.

Two implementations:

| Implementation | When used | Network | Cost |
|---|---|---|---|
| `FakeAgent` | Default | No | Free |
| `LlmAgent` | `ANVIL_E2E_AGENT=llm` + `ANTHROPIC_API_KEY` | Yes | Real |

`createAgentFromEnv` returns the right one based on the env vars.

## Adding a new skill-e2e test

1. Pick a user-impacting skill.
2. Pick a user prompt that exercises the rule the skill encodes.
3. Hand-write the canned compliant output (the response a well-behaved
   agent would give). FakeAgent returns this verbatim.
4. Write at least one **behavioral** assertion — a predicate on the
   response text that captures the property we care about, not the
   exact string. The assertion must hold for both the canned fake
   output and a plausible real LLM output.

Skeleton:

```ts
import { describe, it } from 'vitest'
import { runSkillE2E } from './helpers.js'

describe('skill-e2e: my-skill', () => {
  it('does the expected thing', async () => {
    await runSkillE2E({
      slug: 'my-skill',
      file: { relativePath: 'universal/my-skill.md' },
      userPrompt: 'A prompt that activates the skill.',
      fakeOutputText: 'A compliant response.',
      assertions: [
        {
          label: 'response mentions the key concept',
          predicate: (t) => /key-concept/i.test(t),
        },
      ],
    })
  })
})
```

## Running

```bash
# Default — FakeAgent. Free, fast, no network.
bun test tests/integration/skill-e2e/

# Real LLM track. Requires ANTHROPIC_API_KEY in the env.
bun run test:e2e:llm
```

## Cost discipline

The harness enforces two budget knobs on `LlmAgent`:

| Knob | Default | What it does |
|---|---|---|
| `maxCallsPerTest` | 3 | After N completed calls, the next call throws "cost budget exceeded". |
| `maxTokensPerCall` | 4000 | Passed straight to the SDK as `max_tokens`. |

If a test trips the call ceiling, the failure surfaces immediately with
a clear error rather than racking up spend. Tests construct one agent
per test so the counter is scoped tightly.

The SDK itself (`@anthropic-ai/sdk`) is an **optional dependency**. It
is loaded dynamically only when `ANVIL_E2E_AGENT=llm`. The default
test suite never touches it; you can run the harness in environments
that don't have the SDK on disk.

## How to add the SDK locally

To run the LLM track on your workstation:

```bash
bun add -D @anthropic-ai/sdk
ANTHROPIC_API_KEY=sk-... bun run test:e2e:llm
```

## Known scope

- One-shot only. Each test issues a single agent call. Multi-turn
  conversations aren't modeled.
- Tool-call assertions are minimal. The harness records emitted tool
  calls but tests assert behavioral properties, not exact tool-use
  protocol shapes.
- Premature-tool detection is **not** covered here — that lives in
 (`anvil doctor --live`) and operates on real transcripts.

## Refs

- Pluggable-agent E2E harness (this doc's ticket).
- Live LLM-based triggering evaluation.
- Deterministic transcript validator.
