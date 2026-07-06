---
name: plan-validate
description: Validate a plan's `executable_plan:` frontmatter against the ExecutablePlan schema (ANV-0026). Does NOT execute verification commands.
argument-hint: "<plan-file>"
---

# /plan-validate

Validate an executable plan contract. Reads the YAML frontmatter under the `executable_plan:` key from a plan markdown file and checks it against the Zod schema in `src/core/plans/schema.ts`.

## Usage

```
anvil plan-validate <plan-file> [--json]
```

## What it checks

- Task IDs are unique and well-formed (`A1`, `C3.1`, ...).
- Wave IDs are unique and namespaced (`wave-1`, `wave-foundation`, ...).
- Every `depends_on` reference resolves to a real task.
- The dependency graph is acyclic.
- Every wave-task reference resolves; no task appears in multiple waves.
- A task's dependencies are in the same wave or an earlier wave.
- `write_scope` entries are well-shaped project-relative globs.

## What it does NOT do

- It does NOT execute the plan's verification commands. That is the future plan runner's job (ANV-0025).
- It does NOT mutate the plan file.

## Examples

```bash
# Validate the v0.14.0 plan
anvil plan-validate .anvil/plans/v0.14.0.plan.md

# Machine-readable output for CI gates
anvil plan-validate .anvil/plans/v0.14.0.plan.md --json
```

## Equivalent CLI

`anvil plan-validate <plan-file>`
