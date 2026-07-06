# default-feature — Anvil Workflow Addendum

> This addendum is loaded when the user picks **Anvil-slate** or **Both** as the plan format
> (Q2) during the default-feature workflow, regardless of which location was chosen in Q1.
> It extends the generic workflow body with Anvil-specific references: slate format,
> ticket counter integration, and plan-verifier compliance.

## When This Addendum Applies

The user chose **Anvil-slate** or **Both** as the format (Q2). This triggers:

1. Pass `plan_location` and `plan_format` to the `plan-writing` skill (do not re-ask Q1 or Q2).
2. The `plan-writing` anvil-addendum applies — slate format, `executable_plan` YAML, composition table, and decision traceability.
3. `anvil plan-validate` runs on the produced slate before advancing to `feature-development`.

## Anvil-Specific Hand-off

| From | To | Anvil Artifact |
|---|---|---|
| brainstorming | plan-writing | Design memo with `<decisions>` coverage notes. |
| plan-writing | feature-development | Slate at `${ANVIL_PLANS_DIR}<version>.plan.md` with `executable_plan` YAML and `covered_decisions` list. |
| feature-development | code-reviewer | Commit list, test output, and plan-task check-off keyed to `T-NN` task IDs from the slate. |

## Ticket Counter

When the feature introduces new work items tracked as Anvil tickets, allocate IDs from
`.anvil/_ticket-counter.txt` (bump the counter, then create `${ANVIL_TICKETS_DIR}ANV-NNNN-<slug>.md`).
Never allocate ticket IDs without bumping the counter — collisions corrupt the registry.

## Plan Validation Gate

Before advancing from plan-writing to feature-development, run:

```bash
anvil plan-validate .anvil/plans/<version>.plan.md
```

If validation fails, surface the findings to the user and fix before proceeding. Do not
advance to feature-development with a plan that fails validation.

## Slate References

- Slate format spec: `skills/universal/plan-writing/anvil-addendum.md`
- Plan validation: `anvil plan-validate <plan-file>`
- Decision coverage check: `anvil plan-check-decisions <plan-file>`
- Ticket counter: `.anvil/_ticket-counter.txt`
