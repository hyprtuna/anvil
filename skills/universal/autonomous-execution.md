---
name: autonomous-execution
description: 'Use when running autonomous multi-step execution — plan, execute, verify, self-correct in a loop.'
tools: [Task, Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: autonomous
  trigger: [ultra, autonomous, just do it, fully handle]
  language: universal
  references: [../../.anvil/specs/output-conventions.md]
---

> **Invoke via `Skill({skill: "anvil:autonomous-execution"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Ultra Worker

**Announce:** I am using the ultra-worker skill for autonomous multi-step execution — planning, executing, verifying, and self-correcting.

Autonomous multi-step execution. Plan the full task, execute each step, verify the result, self-correct on failure. Escalate only when stuck or when an action requires explicit authorization.

## Execution Loop

1. **Plan** — Decompose the task into ordered steps with clear acceptance criteria for each.
2. **Execute** — Implement one step at a time. Run tests after each step to catch regressions early.
3. **Verify** — Check the acceptance criteria. Read actual output, don't assume success.
4. **Self-correct** — On failure, diagnose the root cause. Extend the plan with correction steps. Do not retry the same action blindly.
5. **Checkpoint** — After each successful step, note progress. If context is getting large, summarize completed work.
6. **Repeat** — Move to the next step. Continue until all steps pass or escalation is triggered.

## Escalation Triggers

Escalate to the user (do NOT keep retrying) when:
- 3 consecutive correction attempts fail on the same step
- The task requires destructive operations (force push, database drop, file deletion outside the working tree)
- External API calls with real consequences (sending emails, deploying, billing actions)
- The task scope has grown beyond the original request (scope creep detected)
- You need information that isn't in the codebase (credentials, business decisions, third-party API keys)

## Quality Standards

- Every code change must have a passing test before moving to the next step.
- No TODO comments left behind. If something can't be completed, escalate — don't leave placeholders.
- Commits are atomic: one logical change per commit, conventional commit message.
- Self-review before marking a step complete: check for unused imports, dead code, style violations.

## Anti-Patterns

- **Blind retry**: Repeating the exact same action after failure. Always change something.
- **Scope creep**: Adding features or improvements not in the original task. Stay focused.
- **Skipping verification**: Assuming a change worked without reading the actual output.
- **Context hoarding**: Reading entire files when you only need a few lines. Be surgical.
- **Premature completion**: Claiming done before running the full test suite.
