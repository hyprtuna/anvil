---
name: using-anvil
description: 'Use when starting a new Anvil-aware session — bootstrap discovery doctrine, when to invoke skills vs agents, and an index of top user-invocable surfaces. Loaded once on session start.'
user-invocable: false
x-anvil:
  kind: meta
  group: meta
  trigger: [anvil, 'anvil:', what skills, what agents, /anvil]
  language: universal
  tags: [bootstrap, discovery, meta]
---

> **Anvil bootstrap.** This file is injected into the first user prompt of every OpenCode session so the agent learns Anvil exists, what it ships, and how to invoke its surfaces. Keep ≤500 lines.

## Status

Anvil is a language-aware skill system shipped as a Claude Code / OpenCode plugin. It exposes three tool-callable surfaces:

| Surface | Invoked via | Word class | Examples |
|---|---|---|---|
| **Skill** | `Skill({skill: "anvil:<slug>"})` | activity-noun (`-ing`/`-ion`), discipline (`-rule`/`-law`/`-discipline`), reference (`-guide`) | `code-review`, `tdd-iron-law` |
| **Agent** | `Agent({subagent_type: "anvil:<slug>"})` | doer-noun ending `-er`/`-or`/`-architect`/`-hunter`/`-builder`/`-worker`/`-explorer`/`-orchestrator`/`-validator` | `code-architect`, `plan-verifier` |
| **Command** | `anvil <verb>` (CLI) or `/<verb>` (slash) | imperative verb | `init`, `doctor`, `execute-plan` |

The grammatical shape of the slug tells you the right invocation tool. No collisions exist across surfaces — that contract is enforced by `anvil doctor`.

## Discovery doctrine

Three rules govern how an Anvil-aware agent picks its next move:

1. **Agents are the primary surface.** When the user asks for a workflow ("review this PR", "plan a feature", "walk me through this codebase"), reach for an agent before a raw skill. Agents own orchestration; they consume skills internally.
2. **Skills are utilities.** Use a skill directly when the task is a single discipline (e.g. format a changelog, classify a kind). The `/` slash menu lists at most 15 user-invocable skills — these are the canonical entry points.
3. **Commands are operator verbs.** `anvil doctor`, `anvil init`, `anvil skill validate <name>` etc. Reach for these for setup, diagnostics, and content authoring.

## When to invoke (decision triggers)

Invoke an Anvil **skill** when the user's intent matches one of these activity-shaped triggers:

- "review", "code review", "lgtm" → `Skill({skill: "anvil:code-review"})`
- "plan", "break this down" → `Skill({skill: "anvil:planning"})`
- "test-first", "write the test" → `Skill({skill: "anvil:test-driven-development"})`
- "debug", "track down", "root cause" → `Skill({skill: "anvil:debugging"})`
- "spec", "brainstorm" → `Skill({skill: "anvil:brainstorm-spec"})`
- "build a feature", "ship this" → `Skill({skill: "anvil:feature-development"})`
- "git", "commit", "branch" → `Skill({skill: "anvil:git-workflow"})`

Invoke an Anvil **agent** when the user's intent is multi-step orchestration:

- A long autonomous job → `Agent({subagent_type: "anvil:ultra-worker"})`
- Recursive task graph dispatch → `Agent({subagent_type: "anvil:orchestrator"})`
- Heavyweight architectural review → `Agent({subagent_type: "anvil:code-architect"})`

If you're unsure, prefer the skill — skills are atomic and cheap.

## Top user-invocable skills (slash-menu)

These are the ≤15 skills exposed in the `/` menu. Prefer these when the user doesn't name a specific surface:

```
architecture-decision-record  autonomous-execution  brainstorm-spec
changelog-generation          code-review           debugging
development                   feature-development   git-workflow
learning                      mcp-construction      orchestration
planning                      test-driven-development  ui-design
```

Every other skill (language overlays, UI sub-skills, behavioural rules, helpers) is hidden behind `user-invocable: false` but remains fully agent-callable. If you need one, invoke it by its slug — the registry will load it.

## Layered architecture (orientation)

Anvil's source enforces a strict layer order; if you are working *on* Anvil, never import upward:

```
0 core → 1 skills → 2 hooks → 3 agents → 4 commands → 5 adapters → 6 tui → 7 installer
```

`src/core/` imports nothing. Adapters are leaves. The OpenCode plugin (`src/opencode-plugin/`) is a parallel leaf to `src/adapters/`.

## Output discipline (when running a skill)

Every skill body opens with `## Status` and closes with `## Done — status: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`. The first non-heading line is an announce line of the form `**Announce:** I'm using the [skill-name] skill to [purpose].` This signals delegation in otherwise-silent runs.

## Where to look next

- Full system design: `.anvil/_archive/docs-anvil/specs/2026-04-13-anvil-design.md`
- Skill authoring: `skills/CLAUDE.md`
- Per-folder conventions: every directory under `src/` has its own `CLAUDE.md`
- Diagnostics: `anvil doctor`

## Done — status: DONE
