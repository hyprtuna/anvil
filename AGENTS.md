# AGENTS.md — Working on Anvil

**Single source of truth** for AI-developer instructions across every agent-aware editor (Claude Code, OpenCode, Cursor, Codex, etc.). Sibling `CLAUDE.md` is a stub that `@`-imports this file — edit this file, not the stub.

## What is Anvil?

Hybrid CLI + Claude Code/OpenCode plugin shipping a language-aware skill system. Produces an `anvil` CLI binary, a `.claude-plugin/` manifest, and a `.opencode/` config. Original software, not a fork.

System design: `.anvil/specs/anvil-design.md`.
Release history: `CHANGELOG.md`.

## Planning workspace

Anvil dogfoods itself — day-to-day planning artifacts (tickets, release plans, audits, research notes) are generated into `.anvil/` and kept in a separate private workspace. In this repository `.anvil/` is gitignored except `.anvil/specs/` (the architectural canon). Contributors work from the specs, this guide, and the per-folder `AGENTS.md` files; you don't need the planning artifacts to build or extend Anvil.

## Where to find code

| I need to … | Look in |
|---|---|
| Understand the system | `.anvil/specs/anvil-design.md` |
| Add or modify a skill | `skills/` (see `skills/AGENTS.md`) |
| Add or modify a hook | `src/hooks/` (see `src/hooks/AGENTS.md`) |
| Add a CLI command | `src/commands/cli/` (see `src/commands/AGENTS.md` if present, else `src/AGENTS.md`) |
| Add a slash command | `src/commands/slash/` (must have a CLI counterpart) |
| Modify model resolution | `src/core/models/` (see `src/core/models/AGENTS.md`) |
| Add a platform adapter | `src/adapters/` (see `src/adapters/AGENTS.md`) |
| Change project detection | `src/core/project/detect.ts` |
| User-facing docs | `docs/` (see `docs/AGENTS.md`) |

## How to add a new agentic-instructions folder

When introducing a new folder that needs its own AI guidance:

1. **Create `<folder>/AGENTS.md`** with the actual content — this is the source of truth.
2. **Create `<folder>/CLAUDE.md`** as a 2-line stub:
   ```markdown
   <!-- Single source of truth lives in AGENTS.md. Claude Code @-imports it;
   other agents read AGENTS.md directly. Edit AGENTS.md, not this file. -->
   @./AGENTS.md
   ```
3. The architecture test `tests/unit/architecture/claude-md-is-stub.test.ts` enforces that every `CLAUDE.md` in the Anvil-owned tree matches this stub format and has a sibling `AGENTS.md`.

## Code Conventions

- **TypeScript:** strict, no `any`, named exports only.
- **Validation:** Zod at every external boundary (config, CLI args, frontmatter); schemas in `src/core/types.ts`.
- **Async:** `async/await` only.
- **Imports:** ES modules with `.js` extensions (NodeNext).
- **Tests:** Vitest under `tests/` mirroring `src/`. Disk/process tests are integration.
- **Commits:** Conventional Commits. Commit each logical chunk.

## Layered Architecture — Import Rules

Never import upward across these layers:

```
0 core → 1 intent,skills → 2 hooks → 3 agents → 4 commands → 5 adapters → 6 tui → 7 installer
```

`src/intent/` is a layer-1 peer of `src/skills/` — intent detection and routing kernel.
`src/core/` imports nothing. Adapters are leaves. TUI delegates to installer, not directly to adapters.

## Naming — Skills vs Agents vs Commands

The slug's grammatical shape MUST tell you the invocation surface. No collisions across surfaces.

| Surface | Invoked via | Word class | Examples |
|---|---|---|---|
| **Command** | `anvil <verb>` / `/<verb>` | Imperative verb | `init`, `doctor`, `execute-plan` |
| **Agent** | The subagent invocation primitive (Claude Code's `Agent` tool, OpenCode's equivalent, etc.) referencing `anvil:<slug>` | Doer-noun ending in `-er`/`-or`/`-architect`/`-hunter`/`-builder`/`-worker`/`-explorer`/`-orchestrator`/`-validator`/`-resolver`/`-surfacer`/`-selector`/`-analyzer`/`-simplifier`/`-verifier`/`-reviewer` | `code-architect`, `plan-verifier` |
| **Skill** | The skill-invocation primitive referencing `anvil:<slug>` | Activity-noun (`-ing`/`-ion`), discipline (`-rule`/`-law`/`-discipline`/`-standards`/`-pattern`), or reference (`-guide`/`-reference`/`-spec`) | `code-review`, `tdd-iron-law` |

**Hard rules** (enforced by `anvil doctor`):
1. No slug collisions across surfaces.
2. Skills MUST NOT end in any approved agent doer-suffix.
3. Agents MUST end in an approved doer-suffix.

## Primary Surface — Agent-first

Agents are the user-facing primary surface; skills are utilities agents consume. The `/` menu shows high-level agents plus the **≤15 user-invocable skills**. Everything else is hidden via `user-invocable: false` in frontmatter.

When adding a new skill: if it's a direct user entry point, leave `user-invocable` at default and confirm the count stays ≤15 (`anvil doctor` warns past 15). If it's a helper, set `user-invocable: false`.

## What NOT to Do

- No copy-paste from `references/` (research-only, gitignored). Draw patterns, not code.
- Don't break the model resolution chain (tested contract).
- Skill `.md` files only under `skills/`. User skills live in `~/.claude/`.
- Slash commands always have CLI counterparts (`tests/integration/cli-parity.test.ts`).
- Adapters are leaves — no cross-imports with `src/commands/`.
- No `forge` / `@forge/` / `FORGE_*` naming (migration complete).
- Never edit a `CLAUDE.md` directly; it is a stub. Edit the sibling `AGENTS.md`.

## SDD Contributor Workflow

The Spec-Driven Development entry point is the `/sdd-workflow` skill:

```bash
# In any agent session (Claude Code, OpenCode, etc.):
/sdd-workflow <goal>          # full cycle: spec → plan → implement
/brainstorm-spec <goal>       # spec only (then /plan separately)
```

The workflow gates hard: plan-writing is never invoked until the spec is explicitly approved. SDD artifacts are written under `.anvil/specs/features/<slug>/{spec,plan}.md` (local to your workspace; `.anvil/` is untracked here). You can also scaffold a spec manually from `templates/spec-template.md`, then invoke `/plan`.

## Build and Test

```bash
bun run gate         # lint + base + typecheck + tests in one shot — ready-to-push check
npm run build        # compile to dist/
npm run dev          # tsx src/index.ts (hot CLI)
npm run tui          # TUI installer in dev
```

## Per-Folder Guidance

Every AI-developed folder has its own `AGENTS.md` (with a sibling `CLAUDE.md` stub). Read the `AGENTS.md` for the folder you're editing before touching code in it.

## Releases

Releases follow Conventional Commits and the composition policy in `docs/release-policy.md` — every release mixes risk-reduction with new value. The cut is scripted:

```bash
npm run dev:release -- <x.y.z> --dry-run   # preview, no writes
npm run dev:release -- <x.y.z>             # bump versions, prepend CHANGELOG
```

Release history lives in `CHANGELOG.md`.

## Dogfooding

```bash
npm run build
./bin/anvil.cjs init --yes --preset balanced --target both
./bin/anvil.cjs doctor
```

## Agent helpers

Read-only JSON status helpers in `scripts/agent/`. Each exits 0 on success /
2 on failure and never writes to stderr unless `--debug` is passed.

| Question | Helper |
|---|---|
| What branch am I on / how far ahead/behind base? | `bunx tsx scripts/agent/branch-state.ts` |
| What files are dirty/staged/untracked? | `bunx tsx scripts/agent/dirty-files.ts` |
| What was the last test run's result? | `bunx tsx scripts/agent/test-summary.ts` |
| Is the gate currently green? | `bunx tsx scripts/agent/gate-status.ts` |

All helpers: exit 0 on success / 2 on failure, single JSON object to stdout,
never write to stderr unless `--debug` is passed.

See `scripts/agent/README.md` for full JSON schemas.
