---
name: plan
description: Invoke the plan-writing skill to generate an implementation plan from a spec
argument-hint: "[--feature <slug>] [--force] [--strict] [--tier <name>] [--model <id>]"
---

Invoke the `plan-writing` skill with the active feature's spec.

1. Resolve the feature slug from `--feature <slug>` or from `.anvil/state.json` `feature_slug`.
   If neither is available, fall back to the `planning` skill with the provided goal string.
2. Read `.anvil/specs/features/<slug>/spec.md`. If missing, exit 2 with a redirect to `/sdd-workflow` (the SDD entry-point skill).
3. Check the `research_gate` (configurable in `.anvil/anvil.config.json`):
   - If `research_gate=true` and `## Open Questions` is non-empty → blocked (exit 2).
   - Use `--force` to bypass the research_gate for this invocation.
4. Load the `plan-writing` skill from the Anvil skill registry.
5. Compose a prompt from the spec content and goal.
6. Write the plan to `.anvil/specs/features/<slug>/plan.md`.
7. Update `.anvil/state.json`: `phase=plan`.

## Flags

`--feature <slug>` — target a specific feature slug (overrides state.json).

`--force` — bypass the `research_gate` check (open-questions block) for this invocation.
  Sets `ANVIL_FORCE=1` internally. A warning is logged when force is used.

`--strict` — flip all `WorkflowConfig` gates to `true` in-memory for this invocation only
  (does NOT mutate `anvil.config.json`). After plan generation, escalates `plan-verifier`
  from inline self-review to subagent dispatch. The dispatched plan-verifier returns a
  structured `PlanAuditReport` JSON, which the CLI parses and surfaces.
  `--strict` is orthogonal to `--force`: both can be passed simultaneously.

`--tier <name>` — select the model+effort tier for this invocation (e.g. `planning`, `ultra`).
  `--model` wins over `--tier` when both are present.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] plan [--feature <slug>] [--force] [--strict] [--tier <name>] [<goal>]`
