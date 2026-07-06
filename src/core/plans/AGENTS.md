# src/core/plans/ — AI Developer Notes

Layer 0 (core). Executable plan contracts (ANV-0026). Pure schemas + parser, no I/O beyond the file-reading helper that lives in `parse.ts`.

This module defines the shape an evented plan-runner (ANV-0025, future) will consume. The shape lives in YAML frontmatter under the `executable_plan:` key on each `.anvil/plans/v*.plan.md` file. The markdown body remains for humans; the frontmatter is the machine contract.

## Files

- `schema.ts` — Zod schemas (`PlanTask`, `PlanWave`, `ExecutablePlan`, `PlanComposition`). Includes cross-field validation: dependency resolution, cycle detection, wave-task references, wave ordering.
- `parse.ts` — `parseExecutablePlan(markdown)` / `parseExecutablePlanFromFile(path)`. Reads frontmatter via `gray-matter`, validates with Zod, returns a `ParseResult` discriminated union.
- `index.ts` — public re-exports.

## Conventions

- **Task IDs** match `/^[A-Z]\d+(?:\.\d+)?$/` (e.g. `A1`, `C3.1`) — same convention as the heading parser in `src/core/validation/detect.ts`.
- **Wave IDs** are kebab-cased and prefixed with `wave-` (e.g. `wave-1`, `wave-foundation`) — different namespace from task IDs so they cannot collide.
- **Write scopes** are project-relative globs; absolute paths and `..` traversal at root are rejected. Stricter glob semantics are the runner's responsibility, not the schema's.
- **Verification** strings are free-form. This module never executes them.

## Out of scope

- Running plans. That's ANV-0025 (Wave 3-4, future).
- Modifying the markdown body of existing plans. The frontmatter is purely additive.
