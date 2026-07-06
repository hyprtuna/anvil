---
name: plan-status
description: Print a one-line summary of a plan run's state (ANV-0025 Wave 3). Reads `<run-dir>/plan.yml` + `events.jsonl`, replays the journal, prints the projected state. Read-only.
argument-hint: "<run-dir>"
---

# /plan-status

Read the journaled state for a plan run.

## Usage

```
anvil plan-status <run-dir> [--json]
```

## What it does

- Loads the plan snapshot from `<run-dir>/plan.yml`.
- Reads every event from `<run-dir>/events.jsonl`.
- Replays the journal through the pure reducer in `src/core/plans/run-state.ts`.
- Prints the projected `PlanRunState` (runId, planVersion, status, current phase/task, timestamps, event count).

## What it does NOT do

- It does NOT mutate any state.
- It does NOT dispatch a task or advance the run — that is the future plan runner (ANV-0025 Wave 4).

## Examples

```bash
# Pretty status
anvil plan-status .anvil/runs/run-001

# Machine-readable
anvil plan-status .anvil/runs/run-001 --json
```

## Equivalent CLI

`anvil plan-status <run-dir>`
