---
name: plan-check-decisions
description: Check that every decision declared in a plan's <decisions> block is referenced by at least one task in the plan body
---

# /plan-check-decisions

Verify that every decision id declared inside a `<decisions>` block in a plan markdown file is referenced (by id) at least once in the plan's task body. Uncovered decisions are soft-warned by default; `--strict` upgrades to a hard block (exit code 1).

## Usage

```
anvil plan-check-decisions <plan-file> [--strict]
```

## Options

| Flag | Description |
|---|---|
| `--strict` | Exit with code 1 if any decision id is not referenced in the plan body |

## What it does

1. Reads the plan markdown file.
2. Extracts the `<decisions>` block (case-insensitive tag matching).
3. For each decision id, checks whether it appears verbatim anywhere in the plan body outside the decisions block.
4. Prints a coverage report: covered ✔ vs uncovered ⚠ decisions.
5. Without `--strict`: warns on uncovered decisions (exit 0).
6. With `--strict`: exits with code 1 if any decision is uncovered.

## Decisions block format

```markdown
<decisions>
- id: D-001
  title: Use Zod for boundary validation
  rationale: Consistent with existing types.ts conventions.

- id: D-002
  title: Parser lives in core/validation
  rationale: Pure function, no I/O — fits Layer 0.
</decisions>
```

## Examples

```bash
# Soft check — warn on uncovered decisions
anvil plan-check-decisions .anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md

# Hard gate — fail CI if any decision is uncovered
anvil plan-check-decisions .anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md --strict
```
