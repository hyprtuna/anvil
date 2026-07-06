# agents/ — AI Developer Notes

> **Output conventions:** every agent must open with `## Status: <name> starting — <goal>` and close with `## Status: <name> done — <summary>; status: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`. See [`docs/anvil/output-conventions.md`](../docs/anvil/output-conventions.md) for the full spec.
>
> **New in v0.7.0:** `disambiguator` field, four-state status markers (required on all agents), `notepads_section` field. See sections below.

Agent prompt content. Each agent is a `.md` file with YAML frontmatter (same schema as skills with additional `tools` and `max_turns` fields).

## Released agents

- `orchestrator.md` — Tier 2 parallel fan-out; supports `@parallel N` directive (v0.6.0).
- `ultra-worker.md` — Tier 3 autonomous; requires a spec when `--require-spec=true` (default ON, v0.6.0).
- `code-explorer.md` — entry points, call chains, data flow (feature-dev helper); `background: true`.
- `code-architect.md` — proposes 2–3 implementation approaches.
- `code-reviewer.md` — two-stage review (spec-compliance → code-quality); emits `ReviewReport` JSON (v0.6.0).
- `plan-verifier.md` — structured `PlanAuditReport` — gaps, scope creep, ambiguities, missing edge cases. Placed between plan-writing and executor. User-invocable via `anvil plan-audit`. Emits structured JSON output (v0.6.0).
- `strict-reviewer.md` — adversarial review naming tradeoffs and long-term risks; on-demand for high-stakes diffs (`anvil review --strict-review`); NOT in the default chain. (v0.6.0)
- `silent-failure-hunter.md` — error handling auditor, finds silent failures and swallowed errors.
- `test-analyzer.md` — test quality analyst, behavioral coverage and critical gap detection.
- `code-simplifier.md` — simplifies code for clarity while preserving all functionality.
- `doc-verifier.md` — verifies documentation accuracy against code.
- `framework-selector.md` — evaluates competing frameworks; structured tradeoff analysis.
- `mcp-builder.md` — designs and builds MCP servers.
- `researcher.md` — deep research agent.

### Collapsed agents (ANV-0083)

Four single-use review/audit agents were collapsed into sibling
`Task(general-purpose)` prompts under their consuming skill's subdirectory. The
named agents no longer exist; the consuming skill dispatches them as
sub-tasks per the prompt-template pattern.

| Former agent | Consuming skill | Prompt path |
|---|---|---|
| `assumptions-surfacer` | `brainstorm-spec` | `skills/universal/brainstorm-spec/assumptions-surfacer-prompt.md` |
| `comment-analyzer` | `code-review` | `skills/universal/code-review/comment-analyzer-prompt.md` |
| `type-design-analyzer` | `code-review` | `skills/universal/code-review/type-design-analyzer-prompt.md` |
| `retroactive-validator` | `plan-verification` | `skills/universal/plan-verification/retroactive-validator-prompt.md` |

## Output discipline

> Cross-link: see [`docs/anvil/output-conventions.md`](../docs/anvil/output-conventions.md) for the full four-state vocabulary and section templates.

**Mandatory announce line:** before any non-trivial work, the agent body MUST emit a one-line
announcement of intent as its first non-heading content after the opening `## Status:` line.
This is the user's only signal that delegation is happening when output is otherwise silent.

Format: `**Announce:** I'm using the [agent-name] agent to [one-line purpose].`

Example:
```markdown
**Announce:** I'm using the orchestrator agent to fan out implementation tasks to parallel subagents.
```

If an agent body already has an announce-style line near the top, leave it. Add one only if absent.

## v0.7.0 frontmatter additions

### `disambiguator` field (Plan 31 C1)

```yaml
disambiguator: "parallel-wave orchestrator — fan-out + synthesis with explicit headers"
```

When set, the agent loader prefixes `description` at load time:
`Anvil's <disambiguator>: <original description>`

Use this when the agent name collides with built-in agents on the host platform (e.g., `orchestrator`,
`researcher`, `ultra-worker`). Cap: combined string must stay under 200 chars.

### Four-state status markers (Plan 31 D2/D5)

Every agent body MUST begin and end with a status marker:

```markdown
## Status: <name> starting — <one-line goal>

[body]

## Status: <name> done — <one-line summary>; status: DONE
```

The four-state vocabulary for the closing status:
- `DONE` — ready for review / next stage
- `DONE_WITH_CONCERNS` — completed but flagged doubts; document them inline
- `NEEDS_CONTEXT` — blocked on information that wasn't provided
- `BLOCKED` — cannot complete; state the blocker

These markers are checked by `tests/unit/output-conventions.test.ts`.

### `notepads_section` field (Plan 31 F2)

```yaml
notepads_section: decisions   # one of: learnings | decisions | issues | verification | problems
```

When set, the agent runtime appends to the named notepad section after a successful run.
See `skills/AGENTS.md` for the headline-extraction rule and silent-skip condition.

## Rules

- Agents are heavy. Don't add one when a skill chain suffices.
- Agent body is a full prompt — longer than skill bodies, with explicit multi-step behavior.
- TypeScript orchestration lives in `src/agents/`; prompt content lives here.
- All agents must include four-state status markers at start and end (see above).
- Spec-compliance and code-quality review agents (`spec-reviewer`, `code-quality-reviewer`) are read-only: Read/Grep/Glob tools only; never Edit/Write/Bash.

## Output schema convention (Plan 33 B3-B4)

### Schema-bearing agents (structured output)

Four agents declare `output_schema:` in their frontmatter. The runner validates their output
at the return boundary. A mismatch marks the result `done_with_concerns` with structured concerns.

| Agent | Schema |
|---|---|
| `code-reviewer.md` | `ReviewReport` |
| `plan-verifier.md` | `PlanAuditReport` |
| `spec-reviewer.md` | `ReviewReport` (with `review_type: spec-compliance`) |
| `code-quality-reviewer.md` | `ReviewReport` (with `review_type: code-quality`) |

Schema names must exactly match exported Zod schemas in `src/core/types.ts`.

### Schema-free agents (deliberate, v0.9.0)

The following agents are explicitly schema-free. Their outputs are conversational prose;
adding `output_schema` would over-constrain them and require body rewrites. Tracked as
v0.9 candidates in `docs/roadmap.md`.

- `orchestrator.md` — conversational fan-out synthesis
- `ultra-worker.md` — conversational autonomous execution
- `framework-selector.md` — structured tradeoff prose
- `researcher.md` — research narrative
- Language development/tester agents
- All other agents not in the schema-bearing table above

**Rule:** do NOT add `output_schema` to agents not in the schema-bearing table above without
updating the per-agent self-test gate in `tests/integration/output-schema-roundtrip.test.ts`.
