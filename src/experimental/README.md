# src/experimental/

Build-time isolation boundary for in-progress features.

Features here are excluded from `dist/` (default build). Use
`bun run build:experimental` to compile to `dist-experimental/`.

## Status

| Feature | Status | Progress | Owner Ticket |
|---|---|---|---|
| catalog | inflight | 75% | ANV-0246 |
| notepads | inflight | 75% | ANV-0247 |
| extensions | inflight | 75% | ANV-0248 |

## Adding a feature

1. Create `src/experimental/<feature>/` with its code.
2. Register the feature in `src/core/experimental-registry.ts`.
3. Add test files under `tests/experimental/<feature>/`.
4. File a ticket (ANV-NNNN) and reference it in the registry entry.

See `src/experimental/AGENTS.md` for full conventions.
