---
name: plan-audit
description: Run the plan-verifier audit gate on a plan markdown file — emits a structured PlanAuditReport with gaps, coverage, and a PASS/FAIL verdict
argument-hint: "<plan-file>"
---

Dispatch `plan-verifier` to audit an implementation plan markdown file.

1. Take the argument as the path to the plan file (relative or absolute).
2. Verify the file exists before dispatching.
3. Load the `plan-verifier` agent from the Anvil agent registry.
4. Compose the input: `Plan file: <path>`.
5. Run plan-verifier — it performs goal-backward analysis across up to 7 verification steps.
6. The agent emits a markdown **Plan Verification Report** followed by a `PlanAuditReport` JSON block conforming to `src/core/types.ts`.
7. Surface the verdict (`PASS` / `FAIL`), gap list, and coverage counts to the user.

## When to Use

- After `plan-writing` or `planning` emits a new plan, before dispatching `subagent-executor`.
- When reviewing a plan contributed by another agent or team member.
- As part of the orchestrator audit gate (see `agents/orchestrator.md`).

## Equivalent CLI

`anvil plan-audit <plan-file>`
