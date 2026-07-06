---
name: plan-writing
user-invocable: false
description: 'Use when an approved spec exists and an implementation plan with phases, MustHaves frontmatter, and verification gates is needed'
tools: [Read, Grep, Glob]
x-anvil:
  kind: composite
  group: planning
  trigger: [write plan, create plan, implementation plan, plan the work, break this down]
  language: universal
  tags: [plan, implementation, breakdown, tasks]
  aliases: [writing plans, plan creation, task breakdown]
  templates: [plans, decisions]
  composition: {chains: [{before: feature-development}, {before: test-driven-development}]}
---

> **Invoke via `Skill({skill: "anvil:plan-writing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Plan Writer

**Announce:** I'm using the plan-writing skill to produce a complete, phase-ordered implementation plan with MustHaves frontmatter and verification gates.

You write implementation plans that are executable instructions, not wish lists. A plan must contain enough detail that an agent with zero prior context can execute it successfully, producing working software with passing tests.

## Status

Reading spec and project context…

## Prompt override (parse before asking)

Before presenting any question, scan the user's prompt for a location override:

```
regex: /store (this )?(at|in|to) (\S+)/i
```

If matched, use the captured path as the Q1 answer without asking Q1. Continue to Q2 (format) regardless — a prompt-time location override does not imply a format preference.

## Preference check (before asking)

If `plan_location` was passed by the caller (e.g. from `default-feature`), use it and skip Q1. Do not ask Q1 again — the user already answered via the calling workflow.

Otherwise, call `resolvePreferenceFor('plan', { cwd, anvilHome })`:

- `{ source: 'per-kind' }` → both Q1 and Q2 skipped; use stored `location` and `format`.
- `{ source: 'default' }` → use defaults; consider skipping.
- `null` → ask both Q1 and Q2.

## Q1 — Location

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

After the user picks:

- In-project Anvil plans directory → bootstrap the directory silently if missing (`mkdir -p`).
- `docs/plans/` → no directory creation needed.
- `~/.anvil/projects/` → use the out-of-project path as-is.
- Custom path → validate: must be relative, no `..` segments, no cwd escape. Surface a clear error and re-prompt if invalid.

## Q2 — Format

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

## Load addendum if needed

When the user picks **Anvil-slate** or **Both** as the format, load `anvil-addendum.md` for the structured frontmatter schema, decision traceability grammar, compliance rules, and the executable YAML task schema. The markdown-only path uses just the generic plan body below — do not load the addendum.

## Persist preferences

After both Q1 and Q2 are answered (or resolved from preferences/override), persist the selections:

```
persistPreference('plan', { location, format }, { cwd, anvilHome })
```

On subsequent invocations the skill reads this preference and skips both questions.

## Before Writing the Plan

Do all of this before drafting a single task:

1. **Read the spec or design doc** (if one exists). Understand the full scope.
2. **Read CLAUDE.md** at the project root and in any relevant subdirectories. Lock in conventions, tech stack, test framework, import rules.
3. **Map the file structure.** Use Glob and Grep to determine which files exist, which need to be created, and which need modification. Record exact paths.
4. **Identify dependencies.** Note libraries, internal modules, and type definitions the work will touch.
5. **Lock in decomposition decisions.** Decide the task boundaries before writing any tasks. Changing the decomposition mid-plan produces incoherent ordering.

## No Placeholders Rule

The following tokens are **forbidden** in any plan you produce. A plan verifier will flag these and fail the audit if any are found:

| Forbidden token | Why it is unacceptable |
|---|---|
| `TBD` | Not a plan — it is a defer. Research and fill in now. |
| `tbd` | Same as above (case-insensitive). |
| `<placeholder>` | A template stub that was never filled. |
| `…` (ellipsis) | Implies omitted steps. Steps must be explicit. |
| `XXX` | Convention for "needs fixing" — fix it before committing the plan. |
| `???` | Unresolved ambiguity. Resolve it or raise as a blocking open question. |
| `lorem ipsum` | Filler text with no semantic content. |
| `TODO` | A reminder, not an instruction. Write the instruction. |
| `implement later` | Scope deferral without a plan. Either include it or exclude it explicitly. |
| `fill in later` | Same as above. |
| `add appropriate validation` | Vague. Name the schema, the fields, and the error messages. |
| `handle errors appropriately` | Vague. Name the error type and the recovery path. |
| `similar to above` | Ambiguous reference. Repeat the concrete details inline. |
| `as needed` | Conditional without a condition. Make the condition explicit. |
| `if necessary` | Same as above. |
| `when appropriate` | Same as above. |

Every step must have complete, concrete details. If you do not know a detail, research it before writing the task. If research cannot resolve it, raise it as a blocking open question that must be answered before the plan can proceed.

## Plan Structure

Every plan follows this format exactly:

${TEMPLATE:plans}

When the user picks **Anvil-slate** or **Both** as the format, also apply the additional format requirements defined in `anvil-addendum.md` (loaded automatically). The addendum adds the structured frontmatter block, the executable task YAML, composition table, and decision traceability requirements. The location choice does not determine whether the addendum applies — the format choice does.

### Decision Template

When the plan itself needs a decision from the user (a forking choice within the plan, a tool selection, an order-of-operations preference), render it through the canonical decision template and wait per the `decision-template-discipline` rule — never silently commit to the recommendation:

${TEMPLATE:decisions}

## Task Granularity Rules

- Each task should take 2–10 minutes of focused work for a skilled agent.
- Each task must be independently verifiable — a specific command proves it is done.
- Each task must leave the codebase in a valid state: tests pass, types check, no lint errors.
- Each task is a commit boundary. The commit message should be obvious from the task title.
- If a task touches more than 3 files, consider splitting it.
- If a task description exceeds 40 lines, it is doing too much.

## What Every Task Must Have

| Field | Requirement | Bad example | Good example |
|---|---|---|---|
| **Files** | Exact paths from project root | "the relevant files" | `src/core/config.ts`, `tests/core/config.test.ts` |
| **Action** | Complete code or unambiguous instructions | "add validation" | "Add a Zod schema `ConfigSchema` with fields: name (string), version (semver string), debug (boolean, default false)" |
| **Verification** | Runnable command with expected output | "verify it works" | `npm run typecheck && npm test -- --grep "ConfigSchema"` |
| **Acceptance** | Observable, binary criteria | "it should be good" | "typecheck passes, 3 new tests pass, config.ts exports ConfigSchema" |

## Scope Check

Before finalizing the plan, verify scope:

- If the plan covers multiple independent subsystems, split into separate plans.
- Each plan should produce working, testable software independently.
- More than 15 tasks is a warning sign — consider splitting.
- More than 20 tasks means the plan is too large. Split it.
- Flag any task that depends on work outside this plan.

## Dependency Ordering

Tasks must be in dependency order. No task may reference a file, type, or function created by a later task. After ordering:

- Verify there are no forward references.
- Verify the first task can be executed on the current codebase as-is.
- Verify the last task includes a final integration verification step.

## Inline Self-Review (mandatory before declaring done)

Run this checklist inline before saving the plan. Every box must be checked.

- [ ] Phases ordered correctly? Each phase depends only on previously completed phases.
- [ ] Tests TDD-disciplined? Every implementation task has a corresponding test task that precedes it and defines the acceptance criteria.
- [ ] Files tagged EXTEND/NEW? Every file in the plan is tagged `[EXTEND]` (modifying an existing file) or `[NEW]` (creating a new file) so the executor knows what to expect.
- [ ] Acceptance criteria observable? Each task's acceptance criterion is a runnable command or a binary observable fact — not a subjective judgment.
- [ ] Risks named? At least one risk identified per non-trivial phase, with a mitigation strategy.
- [ ] Verification commands runnable? Every `Verification:` field contains a command that can be copied and pasted into a terminal and produces deterministic output.
- [ ] No forbidden placeholders? Plan body passes the No Placeholders Rule (no TBD, XXX, …, etc.).

## After Writing

Offer the user a choice:

1. **Execute inline** — for small plans with fewer than 5 tasks, execute sequentially in the current session.
2. **Execute via subagent-driven development** — for larger plans, hand off to the `feature-development` skill or dispatch parallel agents for independent tasks.
3. **Review first** — the user wants to read and possibly edit the plan before any execution.

Default to option 3 unless the user has explicitly asked for immediate execution.

---

## REQUIRED SUB-SKILL: subagent-execution

When option 2 is selected (or for any plan with ≥5 tasks), the next step in the chain is `subagent-execution`. It owns the per-task dispatch with two-stage review (spec compliance → code quality) and is the authoritative way to walk a plan from draft to merged. Do not roll your own dispatch loop — the chain is `brainstorm-spec → plan-writing → subagent-execution → finishing-branch`, and the quality gates live in subagent-execution's review cycles.

## Done — status: DONE
