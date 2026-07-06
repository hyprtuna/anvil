---
name: subagent-execution
user-invocable: false
description: Use when executing an implementation plan via fresh subagents — runs spec-compliance and code-quality review gates per task.
tools: [Task, Read, Grep, Glob]
x-anvil:
  kind: atomic
  group: development
  trigger: [execute plan, implement plan, run plan, sdd, subagent driven]
  language: universal
  tags: [execute, implement, subagent, review]
  aliases: [subagent driven development, plan execution]
---

> **Invoke via `Skill({skill: "anvil:subagent-execution"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Subagent Executor

Execute implementation plans by dispatching one fresh subagent per task, with mandatory two-stage review (spec compliance then code quality) before any task is marked complete. Fresh subagents prevent context rot. Two-stage review prevents both spec drift and quality decay.

## Core Principle

The quality equation is simple: **fresh subagent per task + spec compliance review + code quality review = high quality without context rot.** Each subagent starts clean, receives only the context it needs, and has its work verified by independent reviewers before the next task begins. No subagent accumulates stale context from prior tasks. No implementation ships without both spec and quality gates passing.

## Before Starting

Complete all of these before dispatching the first subagent:

### 1. Read the Full Plan

Read the plan file end to end. Do not skim. You need to understand the full scope to provide correct context to each subagent and to identify cross-task dependencies.

### 2. Extract All Tasks

Build an internal list of every task with its complete text. For each task, record:

- Task number and title
- Files to create, modify, or delete
- Action description (the full text, not a summary)
- Verification command
- Acceptance criteria
- Dependencies on prior tasks

### 3. Create a Progress Checklist

Use TodoWrite to create a checklist of all tasks. This is your single source of truth for progress. Update it after each task completes.

### 4. Verify Worktree

If not already in a worktree, set one up. Implementation work should be isolated from the main branch. Check with `git worktree list` — if you are already in a worktree, proceed.

### 5. Read CLAUDE.md

Read the project's CLAUDE.md and any per-folder CLAUDE.md files relevant to the plan. You will pass these conventions to every subagent so they follow project standards.

## Per-Task Execution Loop

Execute tasks sequentially, one at a time. Never dispatch multiple implementers in parallel — file conflicts and merge pain are not worth the time savings.

### Stage 0: Prepare Context

Before dispatching the implementer, gather everything it needs:

- **Full task text.** Copy the entire task (title, files, action, verification, acceptance) into the subagent prompt. Never tell the subagent to "read the plan file" — that wastes its turns and risks misinterpretation.
- **Relevant file contents.** If the task modifies existing files, read them and include key sections (types, interfaces, function signatures the task will interact with).
- **Conventions.** Include the project's CLAUDE.md rules that apply to this task (import rules, naming, test framework, etc.).
- **Prior task outputs.** If this task depends on files created by earlier tasks, confirm those files exist and summarize what they export.

### Stage 1: Dispatch Implementer

Dispatch a fresh subagent via Task() with:

- The complete task text (from the plan, verbatim)
- All context gathered in Stage 0
- Clear instruction: "Implement this task. When done, report DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED."
- Model selection based on task complexity (see Model Selection below)

### Stage 2: Handle Implementer Response

The implementer will return one of four statuses:

- **DONE** — Implementation complete, proceed to review.
- **DONE_WITH_CONCERNS** — Implementation complete but the subagent flagged concerns. Read the concerns. If they are about correctness (wrong approach, missing edge case, spec ambiguity), address them before review. If they are about style or preference, proceed to review.
- **NEEDS_CONTEXT** — The subagent could not complete the task because it lacked information. Provide the missing context and re-dispatch a fresh subagent (do not reuse the same one).
- **BLOCKED** — The subagent hit an obstacle it cannot resolve (missing dependency, broken build, spec contradiction). Assess the blocker. If you can resolve it (install a dependency, fix a prior task's output), do so and re-dispatch. If not, escalate to the user with a clear description of what is blocked and why.

### Stage 3: Spec Compliance Review

After the implementer reports DONE, dispatch a fresh review subagent to verify spec compliance. This reviewer checks whether the implementation matches the task specification — nothing more.

Provide the reviewer with:
- The original task text (identical to what the implementer received)
- The list of files changed (from the implementer's report)
- Instruction: "Does this implementation match the task spec? Check: all requirements met, nothing missing, nothing extra. Report PASS or FAIL with specific findings."

**If FAIL:** Read the reviewer's findings. Dispatch a fresh implementer subagent with the original task text plus the review findings. The implementer fixes the issues. Then re-dispatch the spec compliance reviewer. Repeat until PASS (max 3 cycles — if still failing after 3 cycles, escalate to the user).

### Stage 4: Code Quality Review

Only after spec compliance passes. Dispatch a fresh review subagent to check code quality. This reviewer evaluates whether the implementation is well-built — not whether it matches the spec (that was already verified).

Provide the reviewer with:
- The files changed
- The project's CLAUDE.md conventions
- Instruction: "Review this code for quality: error handling, type safety, naming, test coverage, patterns, duplication. Report PASS or FAIL with specific findings. Only flag issues at confidence >= 80%."

**If FAIL:** Read the findings. Dispatch a fresh implementer subagent with the quality review findings and the original task context. The implementer fixes the issues. Then re-dispatch the quality reviewer. Repeat until PASS (max 3 cycles — escalate if still failing).

### Stage 5: Mark Complete

After both reviews pass:

1. Update the TodoWrite checklist — mark this task as complete
2. Verify the codebase is in a valid state: run the verification command from the plan
3. Commit the changes with a conventional commit message derived from the task title
4. Move to the next task

## Model Selection by Task Complexity

Not every task needs the most capable (and expensive) model. Match the model to the work:

| Complexity | Characteristics | Model Tier |
|---|---|---|
| **Mechanical** | 1-2 files, copy-paste pattern, clear spec, no design decisions | Fast/cheap (`haiku` or `sonnet`) |
| **Integration** | 3-5 files, follows established patterns, some wiring decisions | Standard (`sonnet` with high effort) |
| **Architecture** | New patterns, API design, complex type relationships, multiple valid approaches | Most capable (`opus`) |

When in doubt, use the standard tier. Underspending on a complex task costs more in review cycles than overspending on a simple one.

For review subagents, always use the standard tier or above. Cheap models miss issues.

## After All Tasks Complete

### Final Integration Review

Dispatch a fresh review subagent to review the entire implementation holistically. This reviewer sees all files changed across all tasks and checks for:

- Cross-task consistency (naming, patterns, conventions)
- Integration points (do the pieces fit together correctly?)
- Missing glue code (did any inter-task dependency get lost?)
- Test coverage of the full feature, not just individual units

### Final Test Suite

Run the full test suite: `npm test` (or the project's equivalent). Every test must pass. If tests fail:

1. Identify which task's changes caused the failure
2. Dispatch a fresh implementer to fix the specific failure
3. Re-run the full test suite
4. Repeat until green

### Completion Report

After everything passes, produce a summary:

```
## Execution Summary

**Plan:** [name]
**Tasks:** N completed, 0 skipped, 0 blocked
**Review cycles:** N total (spec: X, quality: Y, final: Z)
**Tests:** all passing

### Per-Task Summary
| # | Task | Impl Model | Spec Review | Quality Review | Commit |
|---|---|---|---|---|---|
| 1 | [title] | [model] | PASS (1 cycle) | PASS (1 cycle) | [sha] |
| 2 | [title] | [model] | PASS (2 cycles) | PASS (1 cycle) | [sha] |
| ... | ... | ... | ... | ... | ... |

### Issues Encountered
- [any blockers, escalations, or surprises worth noting]

### Files Changed
- [complete list of files created, modified, or deleted]
```

## Rules

These are hard constraints, not guidelines:

- **Never skip reviews.** Both spec compliance and code quality reviews are mandatory for every task. No exceptions for "simple" tasks — simple tasks have simple reviews.
- **Never dispatch multiple implementers in parallel.** Sequential execution prevents file conflicts and ensures each task builds on a verified foundation.
- **Never proceed with unfixed review issues.** A FAIL verdict means the task is not done. Fix and re-review.
- **Spec compliance MUST pass before code quality review starts.** There is no point reviewing the quality of code that does not meet its spec.
- **Provide full task text to every subagent.** Never tell a subagent to "read the plan" or "see task 3 above." Each subagent gets everything it needs in its dispatch prompt.
- **Fresh subagent for every dispatch.** Do not reuse a subagent for a second task or a second review cycle. Fresh context prevents accumulated confusion.
- **Max 3 review cycles per stage.** If an implementer cannot satisfy a reviewer after 3 attempts, the problem is likely in the spec or the reviewer's expectations. Escalate to the user.
- **Commit after every task.** Each task leaves the codebase in a committed, valid state. If a later task breaks something, you can identify exactly where it went wrong.

---

## REQUIRED SUB-SKILL: finishing-branch

After the final task in the plan passes both review stages and the last commit
lands, the next step in the SDD chain is `finishing-branch`. It owns the merge
discipline (PR / merge / keep / discard menu) and the cleanup of feature branches
and worktrees. Do not roll your own merge — the Anvil SDD chain is
`brainstorm-spec → plan-writing → subagent-execution → finishing-branch`, and the
branch-hygiene guarantees live in finishing-branch.
