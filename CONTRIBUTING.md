# Contributing to Anvil

Thanks for taking the time. This guide covers the practical shape of a
contribution: setting up the repo, the layered architecture you'll be working
in, the conventions we enforce, and how to land changes.

For the design and vision, read
[`docs/anvil/specs/2026-04-13-anvil-design.md`](docs/anvil/specs/2026-04-13-anvil-design.md)
first. For the active backlog, see [`docs/roadmap.md`](docs/roadmap.md).

## Dev setup

Prerequisites: [Bun](https://bun.sh) (recommended) or Node.js ≥20, Git.

```bash
git clone https://github.com/anvil-ai/anvil.git
cd anvil
bun install
bun run build
bun run test
```

Scripts you'll use regularly:

| Script | Purpose |
|---|---|
| `bun run build` | Compile TypeScript + hook bundles into `dist/` |
| `bun run dev` | Hot CLI via tsx against `src/index.ts` |
| `bun run tui` | Run the TUI installer in dev |
| `bun run test` | Full Vitest suite once |
| `bun run test:watch` | Vitest watch mode |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome format + lint check |
| `bun run lint:fix` | Biome auto-fix |

To dogfood your changes on the Anvil repo itself:

```bash
bun run build
./bin/anvil.cjs init --yes --preset balanced --target both
./bin/anvil.cjs doctor
```

## Layered architecture

`src/` is organized in eight layers; lower-numbered layers cannot import from
higher-numbered ones.

| Layer | Folder | Role |
|---|---|---|
| 0 | `src/core/` | Primitives, types, config, registries. No I/O outside config. |
| 1 | `src/skills/` | Skill loader, selector, chain, runtime. |
| 2 | `src/hooks/` | Lifecycle hook dispatcher + handlers. |
| 3 | `src/agents/` | Orchestrator, ultra-worker, runner. |
| 4 | `src/commands/` | CLI commands + slash command `.md` definitions. |
| 5 | `src/adapters/` | Platform generators (Claude Code, OpenCode). Leaves. |
| 6 | `src/tui/` | `@clack/prompts` TUI installer surface. |
| 7 | `src/installer/` | Install/uninstall execution with atomic writes. |

Every AI-developed folder has its own `AGENTS.md` (single source of truth) and a
sibling `CLAUDE.md` stub that `@`-imports it. Edit `AGENTS.md`, not the stub —
the `tests/unit/architecture/claude-md-is-stub.test.ts` guard enforces the stub
format. Read the `AGENTS.md` for the folder before modifying its code.

## Conventions

- **TypeScript strict.** No `any`, no default exports, named exports only.
- **Zod at boundaries.** Validate external input — config files, CLI args,
  skill frontmatter — via schemas in `src/core/types.ts` (or folder-local).
- **Async/await only.** No raw `.then()` chains.
- **ES modules with `.js` extensions** in import specifiers (NodeNext).
- **Vitest.** Unit tests mirror `src/` under `tests/unit/`; anything hitting
  disk or spawning processes is an integration test under `tests/integration/`
  or `tests/installer/`.
- **Biome.** `bun run lint:fix` before committing.
- **Conventional Commits.** `feat:`, `fix:`, `chore:`, `docs:`, `test:`,
  `refactor:`. One logical change per commit — lean toward smaller commits.

## What NOT to do

- Don't copy code from `references/` — that directory is research-only and
  gitignored. Patterns yes, code no.
- Don't break the 5-layer model resolution chain
  (CLI → ENV → override → group → default) — it's covered by regression tests.
- Don't add a slash command without its CLI counterpart. Parity is checked at
  runtime by `anvil doctor` and in CI via `tests/integration/cli-parity.test.ts`.
- Don't reach from `src/adapters/` into `src/commands/` or vice versa —
  adapters are leaves.
- Don't reintroduce the `forge` / `FORGE_*` naming. The migration is complete.

## Landing a change

1. Branch off `main`. Name it `feat/…`, `fix/…`, or similar.
2. Write code + tests. Keep commits small and conventional.
3. `bun run typecheck && bun run lint && bun run test` all green.
4. Smoke-test `anvil doctor` after install to confirm no regression.
5. Open a PR against `main`. Link the roadmap item or numbered plan it
   addresses.

Implementation plans live under
[`docs/anvil/plans/`](docs/anvil/plans/) and follow the
`YYYY-MM-DD-NN-<slug>.md` convention. Larger features should land as a numbered
plan first.

## Reporting issues

Bug reports, feature requests, and design questions all welcome at the repo
issue tracker. For bugs, `anvil doctor --verbose` output is the single most
useful attachment.
