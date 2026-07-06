# src/experimental/ — AI Developer Notes

This directory holds **experimental feature code** — features that are in-progress and
excluded from the default build. It is a build-time isolation boundary, not a runtime flag.

## What belongs here

Feature code that is:
- Tracked in the experimental registry (`src/core/experimental-registry.ts`)
- Status `inflight`, `paused`, or `graduating`
- Moved here by a dedicated ticket (ANV-0246, ANV-0247, ANV-0248, …)

Currently planned features:
- `catalog/`    — moved from `src/core/catalog/` in ANV-0246
- `notepads/`   — moved from `src/core/notepads/` in ANV-0247
- `extensions/` — moved from `src/installer/extensions/` in ANV-0248

## What does NOT belong here

- The registry itself (`src/core/experimental-registry.ts`) — it is data, not feature code.
  Doctor rows in the default build need to read it.
- Released/graduated features — once a feature ships, it moves back to its layer-appropriate
  location under `src/core/`, `src/installer/`, etc.

## Build rules

- Default build (`tsconfig.json`) **excludes** `src/experimental/**`.
  No file in this tree is emitted to `dist/`.
- Experimental build (`tsconfig.experimental.json`) **includes** `src/experimental/**`
  and emits to `dist-experimental/`.
Two files outside `src/experimental/` are allowed to dynamically import from this tree.
Both are whitelisted in the architecture test. Adding a third requires an explicit ticket.

1. **`src/index.ts`** (ANV-0248) — loads `experimental/register-cli.js` when the
   experimental build is active. `ERR_MODULE_NOT_FOUND` is swallowed; the CLI starts
   normally in the default build.

2. **`src/hooks/handlers/on-large-output.ts`** (ANV-0247) — loads
   `experimental/notepads/core/stash.js` to stash large tool outputs into a notepad
   section. In the default build the module is absent: `ERR_MODULE_NOT_FOUND` is
   swallowed silently and `stashedAt` stays `undefined` (compression summary still
   runs). Any other error emits a `[anvil:on-large-output] warn:` line to stderr so
   unexpected failures are visible.

## Import rules

**Non-experimental source files MUST NOT statically import from `src/experimental/`.**
The architecture test `tests/unit/architecture/experimental-isolation.test.ts` enforces this.
The two whitelisted import sites are `src/index.ts` (ANV-0248) and
`src/hooks/handlers/on-large-output.ts` (ANV-0247). Both use dynamic `import()` with
a narrowed catch.

## Conventions

- Each feature subdirectory is self-contained: its own index, types, and tests under
  `tests/experimental/<feature>/`.
- Feature code must not import from sibling experimental features (no `catalog/` → `notepads/`).
- A feature imports from `src/core/` and `src/installer/` normally (those layers are always built).
