---
name: default-feature
user-invocable: false
description: Use when a user requests a new feature or significant change and no more specific workflow applies — runs brainstorm → plan → implement → review → respond.
tools: []
workflow: {phases: [brainstorming, plan-writing, feature-development, code-reviewer, review-response], terminal: review-response}
x-anvil:
  kind: composite
  group: workflow
  trigger: [build a feature, implement, ship this, new feature, default workflow]
  tags: [workflow, feature, default]
  aliases: [feature workflow]
---

# default-feature workflow

**Announce:** I'm using the default-feature workflow to run the full brainstorm → plan → implement → review → respond pipeline.

## When to use

The user has asked for a new feature, a significant refactor, or a substantive change — and no more specific workflow (debug-first, doc-only, research-only) applies. This is the fallback feature-delivery pipeline.

## Status

Starting brainstorming phase…

## Phase Sequence

Each phase is a skill. Progress is linear — the next phase cannot start until the current phase signals terminal completion.

1. **brainstorming** — explore intent, ask clarifying questions, enumerate candidate designs. Terminal marker: user-approved direction.
2. **plan-writing** — produce a step-by-step implementation plan. Terminal marker: plan committed to the chosen location (or accepted inline).
3. **feature-development** — execute the plan incrementally. TDD is the default discipline. Terminal marker: all plan tasks done, tests green.
4. **code-reviewer** — independent review of the produced changes against the plan and coding standards. Terminal marker: review report with findings or "approve".
5. **review-response** — applies the review's actionable items, marks others as won't-fix with reasoning. Terminal marker: every finding has a disposition.

## Q1 and Q2 — Location and Format (plan-writing phase)

When advancing to plan-writing, ask **both** questions **once**. Do not ask again when invoking
plan-writing internally — pass `plan_location` and `plan_format` through as runtime context.
The user is asked only once across the entire workflow.

### Q1 — Location

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "Where should the plan be stored?",
  "intro": "Choose where to write the plan. Location and format are independent — you will be asked about format next.",
  "options": [
    {
      "label": ".anvil/plans/<version>.plan.md (Recommended)",
      "description": "In-project Anvil plans directory; created if missing. Integrates with anvil plan-validate and anvil plan-run commands."
    },
    {
      "label": "docs/plans/<slug>.md",
      "description": "In-project public-shaped docs. Use when you want the plan in your published documentation."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/plans/<slug>.plan.md",
      "description": "Out-of-project; keeps your project repo clean of generated artifacts. Only shown when ~/.anvil/ exists."
    },
    {
      "label": "Custom path",
      "description": "Relative path you provide. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Integrates with plan validation, plan execution, and the dependency graph; the directory is bootstrapped on first use."
}
```

Note: only show the `~/.anvil/projects/` option when `~/.anvil/` exists on the system.

### Q2 — Format

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "What format should the plan use?",
  "intro": "Anvil-slate integrates with anvil plan-validate and anvil plan-run. Markdown is human-readable for review and discussion. Both writes two files at the chosen location.",
  "options": [
    {
      "label": "Anvil slate (structured frontmatter + markdown body) (Recommended)",
      "description": "YAML frontmatter (executable_plan, must_haves, covered_decisions) + markdown body; consumable by anvil plan-validate and anvil plan-run."
    },
    {
      "label": "Markdown",
      "description": "Plain markdown plan with phases and acceptance criteria; no structured frontmatter; best for human review and discussion."
    },
    {
      "label": "Both",
      "description": "Write both an Anvil-slate and a plain markdown file at the chosen location; use when both tooling and human audiences matter."
    }
  ],
  "_rationale": "Anvil-slate enables plan validation and execution via tooling; markdown serves human readers reviewing in PRs."
}
```

After the user picks location and format, pass both choices through to `plan-writing` as `plan_location` and `plan_format`. The plan-writing skill must not ask Q1 or Q2 again — it inherits both answers from this workflow.

## Hand-off Artifacts

| From | To | Artifact |
|---|---|---|
| brainstorming | plan-writing | Design memo (markdown) naming chosen approach and scope. |
| plan-writing | feature-development | Plan file at the chosen location with tiered tasks and DAG. |
| feature-development | code-reviewer | Commit list, test output snapshot, plan-task check-off. |
| code-reviewer | review-response | Review memo with severity-tagged findings. |
| review-response | (terminal) | Disposition list: applied / deferred / won't-fix with rationale. |

## Failure Propagation

If any phase returns `done_with_concerns` or `blocked`, decide whether to extend the graph (add a correction or research sub-triad) or escalate to the human operator. Document the reason for escalation before stopping.

## Why it's a composite skill

The phases are each their own `atomic` skill. This file binds them into a named workflow so the orchestrator can request a consistent feature-delivery pipeline with one call.

## Done — status: DONE
