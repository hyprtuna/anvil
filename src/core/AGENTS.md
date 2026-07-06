# src/core/ — AI Developer Notes

Layer 0 — the kernel. Pure primitives: types, config loading, model resolution, project detection, registries.

## Rules

- No I/O outside `config/` (which reads and writes `.anvil/` and platform config files).
- Every exported type is validated by a Zod schema in `types.ts`.
- No imports from higher layers (`skills/`, `hooks/`, `agents/`, `commands/`, `adapters/`, `tui/`, `installer/`).
- Functions in `models/resolve.ts` must remain pure — pass config as an argument, don't read from disk.

## Files

- `types.ts` — Zod schemas for `Config`, `Skill`, `Hook`, `Agent`, `Models`, `ProjectContext`.
- `config/load.ts` — multi-level merge (project → user → defaults).
- `config/defaults.ts` — default `ModelsConfig`.
- `config/presets.ts` — `balanced`, `cost-optimised`, `max-quality`, `speed-first`.
- `models/resolve.ts` — 8-layer resolution: CLI → CLI-tier → Session → ENV → Agent-override → Tier → Override → Group → Default.
- `models/trace.ts` — debug output: every layer's match/miss.
- `models/aliases.ts` — provider-neutral short aliases (`cheap`/`balanced`/`best`) and Anthropic-shorthand legacy (`haiku`/`sonnet`/`opus`). **Single point of update** when the provider ships a new model; concrete IDs live nowhere else in source (per Plan 41 D-01).
- `project/detect.ts` — parallel detectors with weighted confidence.
- `project/stack.ts` — stack type definitions.
- `registry/skill-registry.ts`, `hook-registry.ts`, `agent-registry.ts` — in-memory registries.

## Model resolution — 8-layer chain

`src/core/models/resolve.ts` owns the canonical precedence. Higher layers
win; the first layer with a concrete match resolves the model.
See `src/core/models/AGENTS.md` for the full layer-by-layer reference.

| # | Layer | Source | Wins when |
|---|---|---|---|
| 1 | CLI (`--model`) | `cli` | `--model` flag at invocation. Highest authority. |
| 1b | CLI-tier (`--tier`) | `cli-tier` | `--tier <name>` provided without `--model`; resolves via `config.tiers`. |
| 2 | Session | `session` | `.anvil/active-model.json` loaded with a `model` field. |
| 3 | ENV | `env` | `ANVIL_MODEL` env var set. |
| 4 | Agent-override | `agent-override` | `config.agents[<name>].model` direct pin. |
| 5 | Tier | `tier` | `config.agents[<name>].tier` → `config.tiers[<tier>]` lookup. |
| 6 | Override | `override` | `config.overrides[<name>]` per-entity block. |
| 7 | Group | `group` | Entity in `config.groups[<g>].members[]`. |
| 8 | Default | `default` | Nothing above matched. Always resolves. |

Exports:
- `resolveModel(name, config, { env, cliArgs? }): ModelResolution` — single entry point.
- `traceResolution(...)` in `models/trace.ts` — debug output showing every layer's match / miss (all 8 layers).
- `models/aliases.ts` — human-friendly aliases (`fast`, `balanced`, `powerful`) into concrete model ids.

Contract invariants (tested in `tests/unit/core/models/`):
- **Purity:** `resolveModel` never reads disk; all data comes from the `config` argument and `env`.
- **Always resolves:** every skill/agent gets a concrete model back, never `undefined`.
- **Source tag:** `ModelResolution.source` is one of `'cli' | 'cli-tier' | 'session' | 'env' | 'agent-override' | 'tier' | 'override' | 'group' | 'default'`.
- **Layer count:** 8 distinct source tags; enforced by `tests/unit/core/models/chain-layer-count.test.ts`.
- **Back-compat:** adding a new layer is additive only; existing tests capture the current order and must stay green.

## When modifying

- Changed a type? Update the Zod schema in the same commit.
- Changed resolution logic? Add/update a test in `tests/unit/core/models/`.
- Changed project detection? Add a fixture in `tests/fixtures/` exercising the change.
