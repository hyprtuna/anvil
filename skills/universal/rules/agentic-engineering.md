---
name: agentic-engineering
user-invocable: false
description: 'Use when reasoning about delegation — heuristics for spawning subagents, task decomposition, model-tier routing, and cost discipline; referenced by orchestrator and ultra-worker.'
tools: []
x-anvil:
  kind: atomic
  group: rules
  trigger: []
  language: universal
---

# Agentic Engineering

Principles for engineering workflows where agents perform most implementation work and humans enforce quality and risk controls. Follow these rules when decomposing tasks, routing models, and managing multi-agent sessions.

## Operating Principles

1. **Define completion criteria before execution** — what does "done" look like? Write it down before starting any unit of work.
2. **Decompose into agent-sized units** — each unit independently verifiable, single dominant risk, clear done condition.
3. **Route model tiers by task complexity** — do not pay Opus rates for boilerplate transforms.
4. **Measure with evals** — capture failure signatures before implementation; re-run after to confirm the delta.

## Task Decomposition — The 15-Minute Rule

Each work unit should be completable by a subagent in roughly 15 minutes. A unit is the right size when:

- It has a single dominant risk (the thing most likely to go wrong).
- Its outcome is independently verifiable (a test, a type check, a diff review).
- It has an unambiguous done condition written before execution starts.

Split when a unit touches more than two layers or requires more than two tool call types. Merge when two units would need to share context that cannot be cleanly passed as a message.

## Model Tier Routing

| Tier | Use for |
|---|---|
| Haiku | Classification, boilerplate transforms, narrow slot-fill edits, commit message generation |
| Sonnet | Implementation, refactors, multi-file edits within a defined spec |
| Opus | Architecture design, root-cause analysis spanning multiple codebases, multi-file invariant reasoning |

Escalate model tier only when the lower tier fails with a clear reasoning gap — not for comfort or speed.

## Parallel Subagent Dispatch

Spawn parallel subagents when:
- Work units are independent (no shared mutable state, no ordering dependency).
- The task set is homogeneous (same kind of work, different targets).
- Combined latency savings outweigh orchestration overhead.

Do not spawn parallel agents when:
- Units have sequential dependencies (output of A is input of B).
- Failure in one unit requires rollback of others.
- The total token spend would exceed the benefit.

## Session Strategy

- Continue the same session for closely coupled work units that share large context.
- Start a fresh session after major phase transitions (design complete, now implementing; implementation complete, now testing).
- Compact after milestone completion, not during active debugging — compacting mid-debug loses failure context.

## Review Focus for Agent-Generated Code

Prioritize human review on:
1. **Invariants and edge cases** — agents satisfy the happy path; review the boundaries.
2. **Error boundaries** — what happens when a dependency fails?
3. **Security and auth assumptions** — agents may not know the trust model.
4. **Hidden coupling** — changes that look isolated but break distant contracts.
5. **Rollout risk** — is this change reversible if it misbehaves in production?

Do not spend review cycles on style disagreements when a linter already enforces style automatically.

## Cost Discipline

Track per task unit:
- Model tier used
- Token estimate before / actual after
- Retry count
- Wall-clock time
- Success / failure

Escalate tier only when the lower tier fails with a reasoning gap. Haiku handles more than most teams expect — try it before assuming Sonnet is required.

## Eval-First Loop

1. Define the capability eval (what should the system do?) and regression eval (what should it not break?).
2. Run baseline and record failure signatures.
3. Execute the implementation.
4. Re-run evals and compare deltas. Accept only if capability improves and regressions stay zero.
