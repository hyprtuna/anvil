---
name: plan-run
description: Walk a plan markdown file, bootstrap a run directory, and record state transitions via the Wave-4 plan runner (ANV-0025). Default mode is state-tracker; pass --auto to delegate to the step registry.
argument-hint: "<plan-path> [--auto] [--json]"
---

# /plan-run

Drive a plan to journaled completion via the evented plan runner.

## Usage

```
anvil plan-run <plan-path> [--auto] [--json] [--run-dir <dir>] [--run-id <id>]
```

## What it does

- Parses the plan's `executable_plan:` frontmatter (ANV-0026).
- Bootstraps a run directory (`/tmp/anvil-runs/<runId>` by default) and
  emits a `plan_run_started` event into the journal.
- Walks each wave in order. For every task in a wave it:
  - emits `task_started`
  - delegates to the step in `STEP_REGISTRY` (or returns a non-dispatched
    success when `--auto` is absent — "would dispatch")
  - on success, attaches a `verification-marker` evidence event for any
    task that declares verification commands (verify-blocks-advance)
  - emits `task_completed`
- On failure, retry-once classifies the error and either schedules a
  second attempt (transient) or halts with a `gate_requested` event
  (deterministic / gate-required).
- Emits `plan_run_completed` on full success.

## What it does NOT do

- The runner does NOT execute the task's verification commands itself
  in Wave 4. A future ticket will wire a real verification runner; today
  it records a marker so the invariant clears.
- The default mode (no `--auto`) does NOT dispatch real Task() calls. It
  records state transitions only — a useful state-tracker before
  autonomous dispatch is trusted.

## Examples

```
# State-tracker mode — record journal without dispatching:
anvil plan-run .anvil/plans/v0.14.0.plan.md --json

# Autonomous mode — invoke registered step executors:
anvil plan-run .anvil/plans/v0.14.0.plan.md --auto
```

## Related

- `/plan-status <run-dir>` — read the journaled state of a run.
- `/plan-validate <plan-path>` — validate the plan frontmatter shape.
