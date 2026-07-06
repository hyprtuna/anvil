---
name: plan-validate-coverage
description: Map plan tasks to test commands and write a validation coverage map (Nyquist gate)
---

# /plan-validate-coverage

Map every task in a plan markdown file to the test command that will verify it. Writes `<plan-stem>-validation.json` and `<plan-stem>-validation.md` as siblings to the plan file. Warns on tasks with no detected test runner.

## Usage

```
anvil plan-validate-coverage <plan-file>
```

## What it does

1. Parses task IDs from the plan headings (`A1.`, `B2.`, `C3.` style).
2. Detects test runners configured in the project (vitest, jest, pytest, go test, cargo test, etc.).
3. Generates a per-task test command heuristic.
4. Writes the result as JSON and a human-readable markdown table.
5. Prints a warning for each task not covered by any detected runner.

## Examples

```bash
# Run against the current plan
anvil plan-validate-coverage .anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates.md
```

This produces:
- `.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates-validation.json`
- `.anvil/_archive/docs-anvil/plans/2026-04-24-30-v0.6.0-workflow-gates-validation.md`

## Pre-execute gate

The `subagent-executor` agent requires this file to exist before starting implementation. If the file is missing, run `anvil plan-validate-coverage <plan>` first, or pass `--no-coverage-gate` to override.
