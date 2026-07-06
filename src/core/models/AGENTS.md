# src/core/models/ — AI Developer Notes

Layer 0 (core). Model resolution and aliasing. Pure functions — no I/O.

## Files

- `resolve.ts` — 8-layer model resolution chain (CLI → CLI-tier → Session → ENV → Agent-override → Tier → Override → Group → Default). The canonical precedence; every skill/agent gets a concrete model back, never undefined. Pure function: takes config + env as arguments, never reads disk.
- `trace.ts` — debug output. For each lookup, reports which layer matched and which layers were skipped. Used by `--trace-models` and the doctor row that surfaces resolution drift.
- `aliases.ts` — provider-neutral short aliases (`cheap` / `balanced` / `best`) and Anthropic-shorthand legacy (`haiku` / `sonnet` / `opus`). **Single point of update** when a provider ships a new model; concrete model IDs live nowhere else in source (Plan 41 D-01).

## Resolution chain

ANV-0213: Eight layers in descending precedence. The first layer with a concrete match wins.
Layer 1b (cli-tier) sits between Layer 1 (CLI --model) and Layer 2 (Session).
When both --model and --tier are supplied, --model wins (tier_overridden_by_model warning attached).

| # | Layer | Source | Wins when |
|---|---|---|---|
| 1 | CLI (`--model`) | `cli` | `--model` flag supplied at invocation. Highest authority. Example: `--model opus` |
| 1b | CLI-tier (`--tier`) | `cli-tier` | `--tier <name>` provided and `--model` absent; resolves via `ModelsConfig.tiers[<name>]`. Throws `UnknownTierError` on unknown tier. Example: `--tier ultra` |
| 2 | Session | `session` | `.anvil/active-model.json` (`ActiveModelFile`) exists with a `model` field; caller is responsible for loading it. |
| 3 | ENV | `env` | `ANVIL_MODEL` env var is set. `ANVIL_EFFORT` and `ANVIL_MAX_TOKENS` also consumed. |
| 4 | Agent-override | `agent-override` | `ModelsConfig.agents[<name>].model` direct model pin in the agents table. |
| 5 | Tier | `tier` | `ModelsConfig.agents[<name>].tier` references a tier that exists in `ModelsConfig.tiers`. Falls through silently when tier name not found. |
| 6 | Override | `override` | `ModelsConfig.overrides[<name>]` per-entity block matched and no higher layer resolved. |
| 7 | Group | `group` | Entity listed in a `ModelsConfig.groups[<g>].members[]` array and no higher layer matched. |
| 8 | Default | `default` | Nothing above matched. `ModelsConfig.defaults` always resolves; guarantees a non-undefined model. |

## Contract invariants

Tested in `tests/unit/core/models/`. Do not change these without updating the test contract:

- **Purity:** `resolveModel` never reads disk; all data comes from the `config` argument and `env`.
- **Always resolves:** every skill/agent gets a concrete model back, never `undefined`.
- **Source tag:** `ModelResolution.source` is one of `'cli' | 'cli-tier' | 'session' | 'env' | 'agent-override' | 'tier' | 'override' | 'group' | 'default'`.
- **Layer count:** exactly 8 distinct source tags enforced by `tests/unit/core/models/chain-layer-count.test.ts`.
- **Back-compat:** adding a new layer is additive only; existing tests capture the current order and must stay green.

## When modifying

- Concrete model ID change? Touch `aliases.ts` only — never sprinkle hardcoded IDs through other files.
- Resolution logic change? Add a test in `tests/unit/core/models/resolve.test.ts`.
- New alias? Add to `aliases.ts` and cover with a test asserting the alias maps to the expected concrete ID.
