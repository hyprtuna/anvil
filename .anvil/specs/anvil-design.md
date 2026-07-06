# Anvil — Design Specification

**Status:** Approved (brainstorming complete, awaiting plan authoring)
**Date:** 2026-04-13
**Authors:** Anvil maintainers (AI-assisted)
**Supersedes:** `forge` (the previous working name)

---

## 1. Summary

**Anvil** is a hybrid CLI + Claude Code/OpenCode plugin that ships a complete, language-aware, role-aware skill system for AI coding agents. From a single source of truth it produces:

1. An **`anvil` CLI binary** for project setup, configuration management, skill scaffolding, diagnostics, and model management.
2. A **`.claude-plugin/`** manifest with skills, hooks, agents, and slash commands consumable by Claude Code.
3. An equivalent **`.opencode/`** configuration consumable by OpenCode.

Anvil is original software (not a fork or wrapper of any reference project) but follows established conventions (`SKILL.md` frontmatter, `.claude-plugin/plugin.json` schema, OpenCode `opencode.json` schema) so it interoperates with other plugins.

---

## 2. Goals & Non-Goals

### Goals

- **Single source of truth** — skills, hooks, agents authored once; materialized for each platform automatically.
- **Layered model resolution** — every skill resolves its model and effort through CLI → ENV → override → group → default.
- **Project-aware** — auto-detect language, framework, test runner, package manager, and CI on `anvil init`.
- **Composable** — skills are atomic units; agents orchestrate skill chains; orchestration has three explicit tiers (sequential, parallel fan-out, recursive autonomous).
- **Multi-platform from day one** — Claude Code and OpenCode adapters ship together; new platforms add via a single adapter file.
- **Author-friendly** — adding a skill means dropping a `.md` file in `skills/`; adding a hook means writing one TypeScript handler.

### Non-Goals (v1)

- Third-party internal-plugin architecture (deferred to v2; current layered structure is designed to evolve into it).
- Cross-session memory like claude-mem (deferred; can interoperate via standard plugin coexistence).
- A skill marketplace UI (skills are file-based; a marketplace can be layered later).
- Support for platforms beyond Claude Code and OpenCode in v1 (Cursor, Codex, Gemini CLI are post-v1 adapters).

---

## 3. System Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                          User invocation                             │
│  $ anvil init       /skill plan       Claude Code SessionStart       │
└─────────────┬────────────────┬───────────────────────┬───────────────┘
              ▼                ▼                       ▼
        ┌──────────┐    ┌──────────┐           ┌──────────────┐
        │   CLI    │    │  Slash   │           │ Hook handler │
        │ commands │    │ commands │           │  (TypeScript)│
        └─────┬────┘    └────┬─────┘           └──────┬───────┘
              │              │                        │
              └──────────────┼────────────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │   Anvil Core (kernel)│
                  │  - skill registry    │
                  │  - model resolver    │
                  │  - project detector  │
                  │  - config loader     │
                  └──────────┬───────────┘
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  ┌──────────┐         ┌──────────┐         ┌──────────────┐
  │  Skills  │         │  Agents  │         │   Adapters   │
  │  (.md)   │         │  (.md)   │         │ claude-code, │
  │          │         │          │         │   opencode   │
  └──────────┘         └──────────┘         └──────────────┘
```

**Three external surfaces:**
- **CLI** (`anvil <verb>`) — toolchain operations
- **Slash commands** (`/<verb>`) — in-session shortcuts inside Claude Code/OpenCode
- **Hooks** — lifecycle events fired by the host harness

**One internal core** (the "kernel"):
- Skill registry (immutable after load)
- Model resolution chain
- Project detector
- Config loader (multi-level merge)

**Three content categories** authored by maintainers:
- Skills (`.md` files with YAML frontmatter)
- Agents (`.md` files; heavier orchestrators with full tool access)
- Adapters (TypeScript modules per platform)

---

## 4. Repository & Module Layout

```
anvil/
├── package.json                    # name: "anvil" — single npm package
├── tsconfig.json
├── README.md
├── CLAUDE.md                       # Project-specific (NOT the bootstrap spec)
├── AGENTS.md                       # AI-developer instructions (root)
├── .gitignore                      # excludes references/, dist/, node_modules/, generated dirs
│
├── docs/
│   ├── getting-started.md
│   ├── skill-authoring.md
│   ├── hook-authoring.md
│   └── installation.md
│
├── .anvil/
│   └── specs/                      # architectural canon (this document, tiers, URI scheme)
│
├── src/
│   ├── core/                       # Layer 0 — primitives, no I/O outside config
│   │   ├── types.ts                # Zod schemas: Config, Skill, Hook, Agent, Models
│   │   ├── config/
│   │   │   ├── load.ts             # multi-level (project → user → defaults) merge
│   │   │   ├── defaults.ts
│   │   │   └── presets.ts          # balanced, cost-optimised, max-quality, speed-first
│   │   ├── models/                 # model & effort resolution (replaces forge-models)
│   │   │   ├── resolve.ts          # 5-layer resolution chain
│   │   │   ├── trace.ts            # debug: returns every layer's match/miss
│   │   │   └── aliases.ts          # fast/balanced/powerful/default → model IDs
│   │   ├── project/
│   │   │   ├── detect.ts           # parallel detectors; weighted confidence
│   │   │   └── stack.ts            # detected stack types
│   │   └── registry/
│   │       ├── skill-registry.ts
│   │       ├── hook-registry.ts
│   │       └── agent-registry.ts
│   ├── skills/                     # Layer 1 — skill system
│   │   ├── loader.ts               # parse frontmatter, validate, register
│   │   ├── selector.ts             # intent → skill mapping
│   │   ├── chain.ts                # skill chaining for multi-role intents
│   │   └── runtime.ts
│   ├── hooks/                      # Layer 2 — hook system
│   │   ├── dispatcher.ts
│   │   ├── handlers/
│   │   │   ├── session-start.ts
│   │   │   ├── user-prompt-submit.ts
│   │   │   ├── pre-commit.ts
│   │   │   ├── post-edit.ts
│   │   │   ├── pre-push.ts
│   │   │   ├── on-error.ts
│   │   │   └── on-pr-open.ts
│   │   └── exit-codes.ts           # 0=success, 1=non-blocking, 2=blocking
│   ├── agents/                     # Layer 3 — agent runners
│   │   ├── orchestrator.ts         # parallel fan-out + synthesizer
│   │   ├── ultra-worker.ts         # autonomous multi-step
│   │   └── runner.ts
│   ├── commands/                   # Layer 4 — CLI + slash commands
│   │   ├── cli/
│   │   │   ├── init.ts
│   │   │   ├── doctor.ts
│   │   │   ├── models.ts
│   │   │   ├── skill.ts
│   │   │   ├── plan.ts
│   │   │   ├── review.ts
│   │   │   └── ultra.ts
│   │   └── slash/                  # slash command .md definitions
│   │       ├── select-skill.md
│   │       ├── plan.md
│   │       ├── review.md
│   │       ├── debug.md
│   │       ├── tdd.md
│   │       ├── ultra.md
│   │       ├── pr.md
│   │       ├── new-skill.md
│   │       └── agents.md
│   ├── adapters/                   # Layer 5 — platform-specific manifest generators
│   │   ├── claude-code/
│   │   │   ├── generate.ts
│   │   │   └── manifest.ts
│   │   └── opencode/
│   │       ├── generate.ts
│   │       └── manifest.ts
│   ├── tui/                        # Layer 6 — TUI installer
│   │   ├── installer.ts
│   │   ├── screens/
│   │   │   ├── welcome.ts
│   │   │   ├── target.ts
│   │   │   ├── scope.ts
│   │   │   ├── languages.ts
│   │   │   ├── bundles.ts
│   │   │   ├── hooks.ts
│   │   │   ├── models.ts
│   │   │   ├── preview.ts
│   │   │   └── execute.ts
│   │   └── components/
│   ├── installer/                  # Layer 7 — install/uninstall execution
│   │   ├── install.ts
│   │   ├── uninstall.ts
│   │   ├── upgrade.ts
│   │   └── verify.ts
│   └── index.ts                    # CLI entry → wires Commander
│
├── skills/                         # CONTENT — skill .md files
│   ├── universal/                  # 20 universal skills (see §6)
│   │   ├── skill-selector.md
│   │   ├── skill-creator.md
│   │   ├── project-explorer.md
│   │   ├── deep-diver.md
│   │   ├── planner.md
│   │   ├── code-reviewer.md
│   │   ├── debugger.md
│   │   ├── learner.md
│   │   ├── git-worker.md
│   │   ├── github-worker.md
│   │   ├── gitlab-worker.md
│   │   ├── orchestrator.md
│   │   ├── ultra-worker.md
│   │   ├── tdd-worker.md
│   │   ├── feature-developer.md
│   │   ├── developer.md
│   │   ├── security-auditor.md
│   │   ├── dependency-manager.md
│   │   ├── doc-writer.md
│   │   └── performance-profiler.md
│   └── languages/
│       ├── javascript/             # js-tester, react-developer, nextjs-developer
│       ├── typescript/             # ts-typer
│       ├── php/                    # php-tester, laravel-developer, php-reviewer
│       ├── python/                 # python-tester, django-developer, fastapi-developer
│       ├── go/                     # go-tester, go-developer
│       ├── rust/                   # rust-developer
│       ├── java/                   # java-developer, spring-developer
│       ├── kotlin/
│       └── ruby/                   # ruby-developer, rails-developer
│
├── agents/                         # CONTENT — agent .md files
│   ├── orchestrator.md
│   ├── ultra-worker.md
│   ├── code-explorer.md
│   ├── code-architect.md
│   └── code-reviewer.md
│
├── hooks/                          # CONTENT — compiled hook scripts (build output)
│   ├── session-start.cjs
│   ├── pre-commit.cjs
│   └── ...
│
├── templates/                      # CONTENT — file templates (Mustache-style {{var}})
│   ├── CLAUDE.md.template
│   ├── AGENTS.md.template
│   ├── models.json.template
│   └── project.json.template
│
├── presets/                        # model preset profiles
│   ├── balanced.json
│   ├── cost-optimised.json
│   ├── max-quality.json
│   └── speed-first.json
│
├── tests/
│   ├── unit/                       # core/, adapters/, registry/
│   ├── integration/                # full install flow against fixture projects
│   └── fixtures/                   # sample js, php, python, go projects
│
└── bin/
    └── anvil.cjs                   # CLI shebang entry
```

### 4.1 Per-Folder Documentation

Every AI-developed folder ships **its own `CLAUDE.md` and `AGENTS.md`** scoped to that folder. Each pair documents:
- What lives in the folder
- Conventions specific to that module
- What NOT to do
- Where related code lives (cross-references to neighboring modules)

| Folder | CLAUDE.md focus | AGENTS.md focus |
|---|---|---|
| `src/core/` | Pure functions, no I/O outside config layer, Zod schemas for all boundaries | Never reach into adapters or commands; core is the lowest layer |
| `src/skills/` | Skill loading semantics, conflict resolution rules | When adding a skill, also update the loader if frontmatter shape changes |
| `src/hooks/` | Exit code semantics (0/1/2), TS-to-CJS compilation | When adding a hook, register it in default `models.json` and adapter manifests |
| `src/agents/` | Agent prompts vs handlers, tool access conventions | Agents are heavy; only add when orchestration cost is justified |
| `src/commands/` | CLI ↔ slash command parity (every slash has a CLI counterpart) | When adding a command, both surfaces must be updated |
| `src/adapters/` | One file per platform, never reach into another platform | When adding a platform, copy an existing adapter as a template |
| `src/tui/` | @clack/prompts widgets, screen flow, no business logic in screens | Screens delegate to commands/installer; never call adapters directly |
| `src/installer/` | Idempotent writes, atomic operations, rollback on failure | Always verify after install; uninstall must reverse every operation |
| `skills/` | YAML frontmatter schema, naming conventions, language overlay rules | Run `anvil skill validate <name>` before commit |
| `agents/` | Agent .md format, when to use Tier 2 vs Tier 3 | Agents are not skills; pick the right surface |
| `templates/` | Token placeholders, never hardcoded paths | Regenerate sample outputs when updating a template |
| `tests/` | Unit/integration split, fixture conventions, snapshot policy | New features need at least one integration test against a fixture |

---

## 5. Skill System

### 5.1 Skill File Format

Every skill is a `.md` file with YAML frontmatter:

```markdown
---
name: code-reviewer
group: review
description: Reviews diffs and files for quality, security, style, and test coverage
trigger:
  - "review"
  - "code review"
  - "pr review"
preferred_model: claude-opus-4-6
preferred_effort: high
max_tokens: 16384
fallback_model: claude-sonnet-4-6
inputs:
  - name: target
    type: string
    description: File path, glob, or "staged" for staged diff
    required: true
outputs:
  - name: findings
    type: array
    description: List of issues with file:line, severity, category
tools:
  - Read
  - Grep
  - Glob
  - Bash
chains:
  - after: planner
  - before: github-worker
language: universal              # or: javascript, php, python, ...
---

# Code Reviewer

[skill body — the prompt content Claude reads when this skill activates]
```

The frontmatter is validated against a Zod schema at load time. Invalid skills are rejected with a clear error.

### 5.2 Three Skill Tiers

| Tier | Path | Purpose | Conflict precedence |
|---|---|---|---|
| **Universal** | `skills/universal/` | Language-agnostic, ship with Anvil | Lowest |
| **Language** | `skills/languages/<lang>/` | Stack-specific overlays, ship with Anvil | Middle |
| **User** | `~/.claude/skills/` or `<repo>/.claude/skills/` | User-authored, project or global | Highest |

The loader scans all three tiers, validates frontmatter, and registers them with conflict detection (user overrides language overrides universal — a user-defined `tdd-worker.md` replaces the shipped one).

### 5.3 Skill Selector (intent → skill mapping)

The **`skill-selector`** is itself a skill (the bootstrap one). At session start (via the `session-start` hook), and at each user prompt (via `user-prompt-submit`), the selector:

1. Reads `<repo>/CLAUDE.md` and `.anvil/project.json` for declared stack.
2. If undeclared, calls `core/project/detect.ts` to infer from extensions + config files.
3. Parses the user prompt for intent keywords → maps to skill role(s).
4. For multi-role intents, builds a skill chain (e.g., `planner` → `feature-developer` → `tdd-worker` → `code-reviewer` → `github-worker`).
5. Falls back to a universal skill when the language overlay is unavailable.

The selector itself runs on `claude-haiku-4-5` with `effort: low` — lightweight routing, not deep reasoning. (This override is in the default `models.json`.)

### 5.4 Orchestration Tiers

Three orchestration patterns, implemented as agent definitions:

```
Tier 1 (Sequential):
    planner → developer → tester → reviewer → git-worker

Tier 2 (Parallel fan-out):
    Orchestrator
    ├── Agent A: Frontend changes
    ├── Agent B: Backend changes
    ├── Agent C: Test generation
    └── Agent D: Docs update
            ↓
        Synthesizer

Tier 3 (Recursive / Autonomous):
    ultra-worker spawns sub-agents dynamically based on a task graph
    it builds at runtime; runs plan → execute → verify → repeat loops.
```

- **Tier 1** is hardcoded chain definitions in `src/skills/chain.ts`.
- **Tier 2** uses `agents/orchestrator.md` which dispatches via `Task()` calls.
- **Tier 3** uses `agents/ultra-worker.md` with full tool autonomy and an internal plan/execute/verify loop.

### 5.5 Skill Registry API

```typescript
// src/core/registry/skill-registry.ts
interface SkillRegistry {
  load(paths: string[]): Promise<void>
  get(name: string): Skill | undefined
  list(filter?: SkillFilter): Skill[]
  resolve(intent: string, context: ProjectContext): Skill[]   // selector logic
  chain(skills: Skill[]): SkillChain                          // composition
  validate(skill: Skill): ValidationResult
}
```

Skills are immutable once loaded. Hot-reload only via `anvil skill reload` (dev mode).

---

## 6. Universal Skill Catalogue (v1)

| Skill | Group | Purpose |
|---|---|---|
| `skill-selector` | planning | Reads project context + prompt intent, selects and chains skills |
| `skill-creator` | meta | Creates new skills following system conventions |
| `project-explorer` | planning | Deep-maps an unfamiliar repo — structure, patterns, entrypoints |
| `deep-diver` | planning | Traces a specific concept, function, or flow across the codebase |
| `planner` | planning | Breaks a feature/task into sequenced subtasks with risk notes |
| `code-reviewer` | review | Reviews diffs or files for quality, security, style, test coverage |
| `debugger` | meta | Systematic bug investigation: reproduce → isolate → trace → fix → verify |
| `learner` | meta | Explains unfamiliar code, concepts, or patterns in project context |
| `git-worker` | automation | Branch, commit, stash, rebase, conflict resolution |
| `github-worker` | automation | PRs, issues, reviews, Actions via `gh` CLI |
| `gitlab-worker` | automation | MRs, pipelines, issues via `glab` CLI |
| `orchestrator` | planning | Fans out parallel sub-agents, collects results, synthesizes output |
| `ultra-worker` | autonomous | Autonomous multi-step execution: plan → execute → verify loop |
| `tdd-worker` | development | Red → green → refactor cycle; generates failing tests first |
| `feature-developer` | development | End-to-end feature implementation: plan → code → test → PR |
| `developer` | development | General-purpose coding assistant scoped to project conventions |
| `security-auditor` | review | Scans for vulnerabilities, secrets, insecure patterns |
| `dependency-manager` | review | Audits, updates, resolves conflicts in project dependencies |
| `doc-writer` | automation | Generates or updates README, inline docs, changelogs |
| `performance-profiler` | review | Identifies bottlenecks, suggests optimizations |

### 6.1 Language Overlays (v1)

For each detected language, an overlay extends the universal skills with language-specific behavior:

| Language | Overlay skills |
|---|---|
| **JavaScript** | `js-tester`, `js-developer` (Node/Bun/Deno aware; npm/yarn/pnpm/bun aware) |
| **TypeScript** | `ts-typer`, `ts-developer` |
| **React** | `react-developer` (Vite/Next/Remix aware) |
| **Next.js** | `nextjs-developer` |
| **PHP** | `php-tester`, `php-reviewer`, `php-developer` (PSR-12, Composer aware) |
| **Laravel** | `laravel-developer` |
| **Python** | `python-tester`, `python-developer` (pip/uv/poetry aware; ruff/black/mypy aware) |
| **Django** | `django-developer` |
| **FastAPI** | `fastapi-developer` |
| **Go** | `go-tester`, `go-developer` (`go test`, `golangci-lint`) |
| **Rust** | `rust-developer` (Cargo, Clippy) |
| **Java** | `java-developer` |
| **Spring** | `spring-developer` |
| **Kotlin** | `kotlin-developer` |
| **Ruby** | `ruby-developer` |
| **Rails** | `rails-developer` |

Languages detected on a project but lacking a shipped overlay get a minimal generic overlay built from detected toolchain at install time.

---

## 7. Hook System

Hooks are TypeScript handlers compiled to CommonJS scripts at install time and registered in `.claude-plugin/plugin.json` (Claude Code) and `.opencode/opencode.json` (OpenCode).

| Hook | Trigger | Default behavior | Exit code semantics |
|---|---|---|---|
| `session-start` | Claude Code/OpenCode opens | Detect stack → load `CLAUDE.md` → suggest top 3 skills → register skill-selector | 0 = continue, 1 = warn |
| `user-prompt-submit` | User sends prompt | Run skill-selector, inject suggested skills as context | 0 always (non-blocking) |
| `pre-commit` | Before `git commit` | Lint + format + unit tests + secret scan | 2 = block commit |
| `post-edit` | After file write | Syntax check + run affected tests (best-effort) | 1 = warn only |
| `pre-push` | Before `git push` | Full test suite + branch protection check | 2 = block push |
| `on-error` | Tool call fails | Log + invoke `debugger` skill if 3+ failures in window | 0 always |
| `on-pr-open` | PR created | Trigger `code-reviewer` + draft PR description | 0 always |

Each hook is independently disable-able via `models.json` `disabled.hooks: [...]`.

**Hook anatomy:**

```typescript
// src/hooks/handlers/session-start.ts
export const handler: HookHandler = async (ctx) => {
  const stack = await detectStack(ctx.cwd)
  const skills = await suggestSkills(stack, ctx.config)
  return { exitCode: 0, context: { stack, suggestedSkills: skills } }
}
```

---

## 8. Slash Commands & CLI Parity

Every slash command has a CLI counterpart. Both invoke the same underlying skill chain.

| Slash | CLI | Underlying skills |
|---|---|---|
| `/anvil-init` | `anvil init` | (CLI shell-out) |
| `/skill <name>` | `anvil skill run <name>` | direct |
| `/select-skill` | `anvil skill select` | skill-selector |
| `/explore <path>` | `anvil explore <path>` | project-explorer |
| `/plan <feature>` | `anvil plan <feature>` | planner |
| `/review` | `anvil review` | code-reviewer |
| `/debug <issue>` | `anvil debug <issue>` | debugger |
| `/tdd <feature>` | `anvil tdd <feature>` | tdd-worker → developer → code-reviewer |
| `/ultra <task>` | `anvil ultra <task>` | ultra-worker |
| `/pr` | `anvil pr` | github-worker or gitlab-worker (auto-detect) |
| `/new-skill <name>` | `anvil skill create <name>` | skill-creator |
| `/agents <task>` | `anvil agents <task>` | orchestrator |

Plus skill-management CLI (no slash equivalents; tooling, not in-session actions):

```
anvil skill list [--language=<...>] [--group=<...>]
anvil skill validate <name>
anvil skill enable <name>
anvil skill disable <name>
anvil skill reload                    # dev mode hot-reload
```

Plus model-management CLI (no slash equivalents; these are tooling, not in-session actions):

```
anvil models list
anvil models show <skill>
anvil models set <skill> <model>
anvil models set-group <group> <model>
anvil models use <preset>
anvil models reset
anvil models validate
```

Plus diagnostic/lifecycle CLI:

```
anvil init [--target=<...>] [--scope=<...>] [--preset=<...>] [--yes] [--dry-run]
anvil doctor
anvil upgrade
anvil uninstall [--scope=<...>]
```

---

## 9. Agents

Agents are heavyweight orchestrators with full tool access, running for many turns.

**Default agents shipped with Anvil:**

| Agent | Tier | Purpose |
|---|---|---|
| `orchestrator` | 2 (parallel fan-out) | Decomposes a task, dispatches sub-agents, collects + synthesizes results |
| `ultra-worker` | 3 (autonomous) | Receives a goal, builds a task graph, executes with self-correction |
| `code-explorer` | helper | Maps entry points, call chains, data flow (adapted from feature-dev pattern) |
| `code-architect` | helper | Proposes 2-3 implementation approaches with trade-offs (adapted from feature-dev) |
| `code-reviewer` | helper | Confidence-filtered code review (≥80% confidence threshold) |

`orchestrator` and `ultra-worker` are heavyweight (Opus, max effort, large token budgets). The three helper agents support feature workflows and run on Sonnet by default.

---

## 10. Model & Effort Configuration

### 10.1 The Existing forge-models, Reshaped under Anvil

The current `@forge/models` package is folded into `src/core/models/` of the new Anvil package. All public surfaces are renamed:

- `@forge/models` → folded into the `anvil` package as `src/core/models/`
- `forge models <cmd>` → `anvil models <cmd>`
- `FORGE_MODEL` / `FORGE_EFFORT` env vars → `ANVIL_MODEL` / `ANVIL_EFFORT`
- `forge-output/` → emitted to project's `.anvil/` and platform `.claude-plugin/`/`.opencode/` dirs
- `models.json` lives in `.anvil/models.json` (single source) and is materialized into `.claude/models.json` and `.opencode/models.json` at install time

The original `forge-models` code is treated as scaffolding/example code — useful to learn from, but freely renamed, restructured, or replaced as needed.

### 10.2 Resolution Chain

5-layer resolution, unchanged from the bootstrap spec:

```
1. CLI flag          --model opus / --effort max
2. ENV var           ANVIL_MODEL=claude-opus-4-6 ANVIL_EFFORT=high
3. overrides[]       Explicit per-skill entry in models.json
4. groups[].members  The group this skill belongs to
5. defaults{}        Global fallback
```

`resolveModel(skillName, config, cliOverrides?)` returns `{ model, effort, max_tokens, source }` where `source` indicates which layer resolved it. `traceResolution()` returns every layer's match/miss for debugging.

### 10.3 Groups (v1)

7 groups, unchanged from the bootstrap spec:

| Group | Default | Members |
|---|---|---|
| **planning** | `claude-opus-4-6`, high | planner, project-explorer, deep-diver, skill-selector, orchestrator |
| **development** | `claude-sonnet-4-6`, normal | developer, feature-developer, tdd-worker, all `*-developer` overlays |
| **review** | `claude-opus-4-6`, high | code-reviewer, security-auditor, performance-profiler, dependency-manager |
| **testing** | `claude-sonnet-4-6`, normal | js-tester, php-tester, python-tester, go-tester, rust-tester |
| **automation** | `claude-haiku-4-5`, low | git-worker, github-worker, gitlab-worker, doc-writer |
| **autonomous** | `claude-opus-4-6`, max | ultra-worker |
| **meta** | `claude-sonnet-4-6`, normal | skill-creator, learner, debugger |

### 10.4 Per-Skill Overrides (defaults shipped with Anvil)

| Skill | Override | Reason |
|---|---|---|
| `ultra-worker` | opus, max, 32K tokens | Autonomous agent needs full context |
| `skill-selector` | haiku, low | Lightweight routing, not deep reasoning |
| `security-auditor` | opus, max | Security work must never cut corners |

### 10.5 Presets (v1)

| Preset | Profile |
|---|---|
| **balanced** (default) | Sonnet baseline; Opus for planning/review/autonomous; Haiku for automation |
| **cost-optimised** | Haiku-heavy; Sonnet for development; Opus only for autonomous |
| **max-quality** | Opus everywhere |
| **speed-first** | Haiku default; Sonnet only for development |

---

## 11. Installation, Project Detection & Adapters

### 11.1 Scopes

| Scope | Path | Purpose |
|---|---|---|
| **Global** | `~/.claude/` and `~/.opencode/` | User-wide skills, hooks, models |
| **Project** | `<repo>/.claude/` and `<repo>/.opencode/` | Per-project overrides |
| **Anvil-internal** | `<repo>/.anvil/` | Single source of truth (project-detected stack, models.json, enabled skills) |

Project scope **always** wins over global. Anvil writes both — the materialized files in `.claude/` and `.opencode/` are derived from `.anvil/`.

### 11.2 `anvil init` — Bootstrap Flow

```
1. System check (Node ≥ 20, Claude Code/OpenCode presence, git available)
2. Project detect (language, framework, test runner, package manager, CI)
3. Confirm or override detected stack
4. Choose target(s): claude-code, opencode, both
5. Choose scope: project (default) or global
6. Choose skill bundles: universal (always) + language overlays
7. Choose hooks (toggle each, defaults from preset)
8. Choose model preset: balanced | cost-optimised | max-quality | speed-first
9. Preview install plan (table)
10. Execute → write .anvil/, .claude-plugin/, .opencode/, hooks
11. Post-install verify → run anvil doctor
12. Print activated skills + next steps
```

Non-interactive: `anvil init --yes --preset balanced --target both` skips the TUI.

### 11.3 Project Detection

Detection runs in parallel; each detector returns `{ confidence: 0..1, evidence: string[] }`.

| Signal | Detected from |
|---|---|
| **Language** | File extensions (weighted), `package.json`, `composer.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `build.gradle`, `Gemfile` |
| **Framework** | Dependencies (`react`, `next`, `laravel/framework`, `django`, `gin-gonic`, `actix-web`, `spring-boot-starter`, `rails`) |
| **Test runner** | Dependencies + config files (`jest.config.*`, `vitest.config.*`, `phpunit.xml`, `pytest.ini`/`pyproject.toml`, `*_test.go`, `Cargo.toml [dev-dependencies]`) |
| **Package manager** | Lock files (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `composer.lock`, `poetry.lock`, `uv.lock`, `Cargo.lock`) |
| **CI/CD** | `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`, `azure-pipelines.yml` |

Output written to `.anvil/project.json`:

```json
{
  "languages": [{ "name": "typescript", "confidence": 0.95 }],
  "frameworks": ["next.js"],
  "testRunners": ["vitest"],
  "packageManager": "pnpm",
  "ci": ["github-actions"],
  "detectedAt": "2026-04-13T17:00:00Z"
}
```

### 11.4 Platform Adapters

Each adapter consumes the unified Anvil config + skills/hooks/agents and emits platform-specific manifests.

**Claude Code adapter** (`src/adapters/claude-code/`):
- `.claude-plugin/plugin.json` — manifest with hooks, slash commands, agents
- `.claude-plugin/marketplace.json` — for marketplace publish
- `.claude/skills/anvil/` — selected skill `.md` files
- `.claude/hooks/` — compiled hook scripts (`.cjs`)
- `.claude/agents/` — agent `.md` files
- `.claude/models.json` — materialized from `.anvil/models.json`

**OpenCode adapter** (`src/adapters/opencode/`):
- `.opencode/opencode.json` — config with hooks (translated names), commands
- `.opencode/skills/` — same skill content
- `.opencode/hooks/` — same compiled hooks
- `.opencode/models.json` — same materialization

**Adapter API contract:**

```typescript
interface PlatformAdapter {
  name: 'claude-code' | 'opencode'
  detect(): Promise<boolean>
  generate(config: AnvilConfig): Promise<GeneratedFiles>
  install(files: GeneratedFiles, scope: Scope): Promise<void>
  uninstall(scope: Scope): Promise<void>
  verify(scope: Scope): Promise<VerifyResult>
}
```

Adding a new platform = implement one adapter. No core changes needed.

### 11.5 `anvil doctor`

Diagnostic command that runs:
- Platform presence (Claude Code/OpenCode versions)
- Manifest validity (JSON schema check)
- Skill file syntax (frontmatter validation)
- Hook compilation status
- Model resolution sanity (every group resolves; no unknown skills in overrides)
- Project detection re-run with diff against stored `.anvil/project.json`

Output: colored table; exit 1 on any failure.

### 11.6 `install.sh` (Curl-Pipe-Bash One-Liner)

The existing `install.sh` is reshaped to call `npx anvil init` under the hood with translated flags, supporting the `curl -fsSL anvil.dev/install | bash` use case.

---

## 12. Documentation Structure

| File | Purpose |
|---|---|
| `README.md` (root) | What Anvil is (3 sentences), quick install, links |
| `AGENTS.md` (root) | **Single source of truth.** Project-specific instructions for AI agents working ON Anvil itself (and any agent-aware editor). |
| `CLAUDE.md` (root) | 2-line `@./AGENTS.md` stub. Claude Code's memory-file protocol picks up the content via the @-import; never edit the stub directly. |
| `docs/architecture.md` | How the layers fit together (this design doc, condensed) |
| `docs/skill-authoring.md` | How to write a new skill, frontmatter reference, examples |
| `docs/hook-authoring.md` | How to write a new hook handler, exit code conventions |
| `docs/installation.md` | Install matrix (CLI vs plugin, project vs global), upgrade path, uninstall |
| `docs/anvil/specs/` | Approved design specs (this doc + the migrated bootstrap spec) |
| `docs/anvil/plans/` | Implementation plans (one per phase, 6 total) |

Every AI-developed `src/<module>/` and content folder ships its own `CLAUDE.md` + `AGENTS.md` (see §4.1).

---

## 13. Testing Strategy

Three layers, kept lightweight (testing is nice-to-have for v1, not gating):

1. **Unit tests** (Vitest) — pure functions in `src/core/`: model resolution, config merging, project detection.
2. **Integration tests** — full install flow against fixture projects in `tests/fixtures/` (small JS, PHP, Python repos); verify generated manifests are well-formed.
3. **Smoke tests** — `anvil doctor` runs cleanly after install; CLI command surface matches help text.

CI (GitHub Actions): typecheck, unit, integration, lint on push/PR. No coverage gate yet — add when stable.

---

## 14. Implementation Plans (sequenced)

Plans live in `docs/anvil/plans/`. Six sequenced plans, each self-contained and independently reviewable:

| # | Plan | Scope | Depends on |
|---|---|---|---|
| 1 | **Repo bootstrap** | git init, `.gitignore`, README/CLAUDE/AGENTS at root + per-folder, package.json rename, tsconfig, dependencies | — |
| 2 | **Core layer** | types, config, model resolution (port from forge-models), project detection, registries | 1 |
| 3 | **Skills + hooks + agents** | Loaders, selector, chain, hook dispatcher + 7 default handlers, agent runner + orchestrator + ultra-worker, all skill `.md` content | 2 |
| 4 | **CLI + slash commands** | All `anvil <verb>` commands, all `/<command>` `.md` files, command parity tests | 2 |
| 5 | **Adapters + installer + TUI** | Claude Code adapter, OpenCode adapter, idempotent installer with rollback, full TUI flow, install.sh wrapper | 2-4 |
| 6 | **Tests + docs + release prep** | Unit/integration tests with fixture projects, full docs, `anvil doctor` validation, marketplace.json + publish prep | 1-5 |

Plans 3 and 4 can run partially in parallel (both depend on 2). Plan 5 needs 2-4. Plan 6 needs everything.

---

## 15. Open Questions & Future Work

- **v2 plug-in extensibility** — extracting `src/core/` into a stable kernel API for third-party internal plugins.
- **Cross-session memory** — interop with claude-mem or shipping a lightweight observation store.
- **Additional platform adapters** — Cursor, Codex, Gemini CLI, Kiro, Trae.
- **Skill marketplace UX** — `anvil skill search`, `anvil skill install <name>`.
- **Telemetry (opt-in)** — anonymous usage stats for which skills get triggered most, to prioritize improvements.

These are explicitly out of scope for v1 but the architecture leaves room for each.

---

## 16. Migration from `forge-models`

The current `src/` directory contains the `@forge/models` package — to be treated as scaffolding. Migration steps (handled in Plan 1, "Repo bootstrap"):

1. Rename `package.json` → `name: "anvil"`, update `bin` entries
2. Move `src/lib/` → `src/core/models/`, `src/core/config/`, `src/core/types.ts`
3. Move `src/commands/index.ts` → `src/commands/cli/models.ts` (refactored)
4. Move `src/cli.ts` → `src/index.ts`
5. Move `src/tui.ts` → `src/tui/installer.ts` (refactored to screens)
6. Rename all `forge` references → `anvil` (string replace + manual review)
7. Rename all `FORGE_*` env vars → `ANVIL_*`
8. Delete the old `forge-output/` if present

Old behavior is fully preserved — just renamed and structurally relocated. No public-API breaks for users (because there are no v1.0.0 users yet).
