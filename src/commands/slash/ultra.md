---
name: ultra
description: Invoke the autonomous ultra-worker agent for open-ended tasks
argument-hint: "<task...> [--strict] [--tier <name>] [--model <id>]"
---

Invoke the `ultra-worker` agent.

Ultra-worker builds a task graph and executes plan → execute → verify loops with self-correction. Escalates to user on destructive actions or repeated failures.

If the user passes `--tier <name>` (e.g. `quick`, `coding`, `review`, `planning`, `ultra`, `super`), forward it to the CLI — it selects the model+effort pair for this invocation via the tier table.

If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer. `--model` wins over `--tier` when both are present.

## Flags

`--strict` — flip all `WorkflowConfig` gates to `true` in-memory for this invocation only
  (does NOT mutate `anvil.config.json`). The strict mode:
  - Enables all workflow gates: `research_gate`, `plan_check`, `decision_coverage`, `verification`.
  - Injects a strict-mode instruction into the agent prompt, directing ultra-worker to
    escalate `plan-verifier` to subagent on validation failures.
  - Is **orthogonal** to `--require-spec` (Plan 30): `--require-spec` checks artifact
    *existence*; `--strict` flips workflow *gate strictness*. Both can be passed together.

`--tier <name>` — select the model+effort tier for this invocation (e.g. `ultra`, `super`).
  `--model` wins over `--tier` when both are present.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] ultra [--strict] [--tier <name>] <task>`
