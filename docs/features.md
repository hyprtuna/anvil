# Anvil Features

Anvil ships a complete, language-aware skill system for Claude Code and OpenCode.
This page is the feature matrix — for how to install and try them, see
[getting-started.md](./getting-started.md).

## What Anvil installs

| Surface | Count | Notes |
|---|---:|---|
| Universal skills | 79 | General-purpose: TDD, debugging, review, research, planning, UI design, … |
| Language overlays | 54 (19 stacks) | JS/TS, React, Next.js, Python, Django, FastAPI, Go, Rust, Java, Spring, Kotlin, Ruby, Rails, PHP, Laravel, C#, Swift, C++ |
| Agents | 18 | orchestrator, ultra-worker, code-reviewer, code-explorer, code-architect, doc-verifier, silent-failure-hunter, test-analyzer, code-simplifier, framework-selector, researcher, plan-verifier, build-error-resolver, mcp-builder, spec-reviewer, strict-reviewer, code-quality-reviewer, subagent-executor (assumptions-surfacer, comment-analyzer, type-design-analyzer, retroactive-validator collapsed into sibling Task(general-purpose) prompts under their consuming skills — |
| Hooks | 30 | session-start / session-end / user-prompt-submit / pre/post-tool-use / pre-commit / post-edit / post-edit-accumulator / pre-push / on-error / on-pr-open / on-large-output / pre-compact / notification / stop / subagent-stop / agent-redirect / context-monitor / gateguard / phase-boundary / prompt-guard / read-guard / rules-injector / rules-prompt-injector / runtime-fallback / spec-handlers / task-banner / workflow-guard / post-test-run |
| CLI commands | 40 | init, doctor, models, skill, plan, review, debug, tdd, ultra, explore, pr, agents, verify, research, quick, progress, pause, resume, discuss, finish, upgrade, revise-claude-md, statusline, notepad, mcp, route, recommend, hooks, plan-audit, plan-validate-coverage, plan-check-decisions, brainstorm-spec, … |
| Adapters | 2 | claude-code, opencode |

## Core capabilities

### Language-aware skill selection
The skill selector scores skills against the current prompt using tags, aliases,
trigger words, and (for language overlays) the detected project stack.
See `src/skills/select.ts`.

### Model resolution
Five-layer chain — CLI flag → env var → override → group default → preset default
— with a `fallback_chain` array for ordered model degradation. Presets: balanced,
cost-optimised, max-quality, speed-first.

### Hooks
Advisory by default. Protective hooks (phase-boundary, read-guard, workflow-guard,
comment-checker, prompt-guard, context-monitor, ui-anti-pattern) are opt-in and
can be gated via `ANVIL_HOOK_PROFILE=minimal|standard|strict`.

### Agents
Each agent carries `mode` (primary | subagent) and `tool_permissions`
(read/write/edit/bash/web). The orchestrator agent runs wave-based parallel
decomposition; the ultra-worker runs a 6-phase execution loop.

### CLI ↔ slash parity
Every CLI command has a matching slash command. Enforced by
`tests/integration/cli-parity.test.ts`.

### Skill evaluation harness
`anvil skill eval <name>` runs a fixture suite against a skill and reports a
score with variance. Catches regressions when expanding skill bodies.

### MCP builder
`anvil mcp new` scaffolds a Model Context Protocol server from an opinionated <!-- doc-drift: skip -->
template. The `mcp-builder` skill walks through tool-design heuristics.

### Intent routing
The `user-prompt-submit` hook classifies prompts into 10 intents
(ultra, explore, review, debug, plan, research, …) and pre-warms the matching
skill/agent chain.

### Statusline
Optional POSIX-compatible status line showing model, context usage %, cost, and
active agent. Enable with `anvil init --statusline`.

### Doctor + doctor --fix
`anvil doctor` checks manifest integrity, slash/CLI parity, model registry,
skill frontmatter, hook executability. `anvil doctor --fix` auto-repairs common
drift.

## What Anvil does NOT include (yet)

- Vector-backed memory (deferred — P3/low; see roadmap)
- Telemetry / usage stats (deferred — P3/low)
- Visual companion for UI brainstorming (deferred — P3/low)
- Plugin publishing (`anvil publish`) (deferred — P3/medium) <!-- doc-drift: skip -->
- IDE integrations (deferred — P3/medium)
- Web docs site (deferred — P3/medium)

See [roadmap.md](./roadmap.md) for the full prioritized backlog.
