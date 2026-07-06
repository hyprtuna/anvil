---
name: plan-verification
user-invocable: false
description: 'Use when verifying an implementation plan against its stated goal — goal-backward analysis catches gaps, incorrect assumptions, missing steps.'
tools: [Read, Glob, Grep]
x-anvil:
  kind: atomic
  group: review
  trigger: [verify plan, check plan, review plan, does this plan work, plan review, validate plan]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:plan-verification"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Plan Verifier

**Announce:** I'm using the plan-verification skill to verify an implementation plan against its stated goal using goal-backward analysis.

You verify that an implementation plan will actually achieve its stated goal. Work backwards from the goal to the steps, not forwards from the steps to the goal.

## Verification Method

1. **Goal extraction** — What is the plan trying to accomplish? State it precisely.
2. **Goal-backward analysis** — Starting from the goal, what conditions must be true for it to be met? Trace backwards to identify what each step must deliver.
3. **Gap analysis** — Are there steps missing that are required to meet a condition? Are any steps unnecessary?
4. **Assumption audit** — What does the plan assume about the current state? Verify each assumption against the codebase.
5. **Risk identification** — What could go wrong? Which risks are unmitigated?

## What to Check

- **Coverage** — Do the steps collectively deliver everything the goal requires?
- **Ordering** — Are steps in the right sequence? Would any step fail because a dependency hasn't been created yet?
- **Scope creep** — Do any steps go beyond what the goal requires?
- **Testability** — Is there a way to verify each step succeeded?
- **Reversibility** — Which steps are hard to reverse? Is there a rollback plan?
- **Missing context** — Does the plan account for existing code that might conflict?

## Prompt override (parse before asking)

Before presenting any question, scan the user's prompt for a location override:

```
regex: /store (this )?(at|in|to) (\S+)/i
```

If matched, use the captured path as the Q1 answer without asking Q1.

## Q1 — Location

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "Where should the verification report be stored?",
  "intro": "Choose where to write the verification report. Location and format are independent — you will be asked about format next.",
  "options": [
    {
      "label": ".anvil/reviews/<slug> (Recommended)",
      "description": "In-project reviews directory; created if missing. Integrates with Anvil reporting commands."
    },
    {
      "label": "docs/reviews/<slug>",
      "description": "In-project public-shaped docs; visible in rendered documentation."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/reviews/<slug>",
      "description": "Out-of-project; keeps your project repo clean. Only shown when ~/.anvil/ exists."
    },
    {
      "label": "Custom path",
      "description": "Relative path you provide. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Co-located with the project and accessible to Anvil reporting commands."
}
```

Note: only show the `~/.anvil/projects/` option when `~/.anvil/` exists on the system.

After the user picks:
- `.anvil/reviews/<slug>` → `mkdir -p .anvil/reviews/` if missing.
- `docs/reviews/<slug>` → no directory creation needed.
- `~/.anvil/projects/` → use the out-of-project path as-is.
- Custom path → validate: must be relative, no `..` segments, no cwd escape.

## Q2 — Format

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "What format should the verification report use?",
  "intro": "Structured JSON integrates with reporting tools and CI pipelines. Markdown is human-readable and renders in PRs.",
  "options": [
    {
      "label": "Structured JSON (Recommended)",
      "description": "Machine-readable report consumable by tooling; best when automated processing is needed."
    },
    {
      "label": "Markdown",
      "description": "Human-readable report with verdict and analysis sections; renders in PRs and on GitHub."
    },
    {
      "label": "Both",
      "description": "Write both a JSON and a markdown report at the chosen location."
    }
  ],
  "_rationale": "Structured JSON enables automated aggregation and tooling integration."
}
```

## Load addendum if needed

When the user picks **JSON** or **Both** as the format, load
[`./anvil-addendum.md`](./anvil-addendum.md) for the structured JSON schema
required by Anvil tooling. The markdown-only path uses the generic report body below.

## Output Format (generic)

```
## Goal

<Precise restatement of what the plan must achieve>

## Verdict

✅ PASS — plan achieves the goal
⚠️ PASS WITH CONCERNS — achieves goal but has risks
❌ FAIL — plan does not achieve the goal

## Analysis

### Gaps
- <Missing step or condition that the plan doesn't address>

### Incorrect Assumptions
- <Assumption that doesn't hold, with evidence from codebase>

### Ordering Issues
- <Step X requires Y which comes after it>

### Risks
- <Risk description> — Mitigation: <suggestion>

## Suggested Changes

<Specific additions, removals, or reorderings needed>
```

## Rules

- Report only what you can verify. If you can't check an assumption from the codebase, flag it as unverified.
- Don't rewrite the plan. Identify gaps and let the user decide how to fill them.
- A plan that achieves the goal through a suboptimal path is still a PASS — note it as a concern, not a failure.

## Sibling sub-task: retroactive-validator

For plans that have already been executed, dispatch a read-only coverage audit as a
`Task(general-purpose)` sub-task using the body of
[`./retroactive-validator-prompt.md`](./retroactive-validator-prompt.md).

The sub-task walks the executed plan, classifies each task as
`covered | partial | uncovered`, and emits a structured coverage report. Use this
when verifying a plan whose implementation has already merged and needs a retroactive
coverage audit.

When running inside an Anvil project (`.anvil/` detected), load `anvil-addendum.md` to
get the structured JSON schema required by Anvil tooling.
