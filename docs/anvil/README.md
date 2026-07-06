# docs/anvil/

This directory contains the **stable-URL artifacts** for the Anvil project:

- `releases/` — canonical release history (`v*.md`). Referenced from `CHANGELOG.md`, GitHub release notes, and historical PR descriptions. **Do not move.**
- `backlog.md` — single grep target for unscoped work items. Actively maintained. **Do not move.**
- `contracts/` — public contracts for third-party integrators (e.g. skill validator stdin envelope). **Stable URLs; version with care.** See [`contracts/validator-envelope.md`](contracts/validator-envelope.md).

## Where active work lives

As of v0.12.2, active research, specs, plans, and audits have been consolidated under `.anvil/`:

| What | Where |
|---|---|
| Current design specs (tiers, output-conventions) | `.anvil/specs/` |
| SDD feature artifacts (spec.md, plan.md, tasks.md) | `.anvil/specs/features/<slug>/` |
| Active audits | `.anvil/audits/` |
| Active research | `.anvil/research/` |
| Active plans / tickets | `.anvil/plans/` / `.anvil/tickets/` |
| Historical artifacts (pre-v0.12.2) | `.anvil/_archive/docs-anvil/` |

See `CLAUDE.md` "Where to Find Things" for the full navigation table.
