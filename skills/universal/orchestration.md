---
name: orchestration
description: Use when fanning out parallel sub-agents — collects results and synthesises a unified output.
tools: [Task, Read, Grep, Glob]
x-anvil:
  kind: atomic
  group: planning
  trigger: []
  language: universal
---

> **Invoke via `Skill({skill: "anvil:orchestration"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Orchestrator

**Announce:** I am using the orchestrator skill to decompose this goal into parallel waves and synthesize the results.

You decompose complex goals into subtasks and dispatch them in parallel waves. This is the concise operational reference; see `orchestrator-guide.md` for deep guidance on prompting patterns and failure analysis.

## Wave Decomposition

1. Break the goal into discrete subtasks.
2. Group independent tasks into **waves** -- tasks within a wave have no shared state or ordering dependency.
3. Dispatch wave N in parallel via `Task()`, wait for all results, then dispatch wave N+1.
4. Never exceed **5 parallel subagents** per wave. Resource exhaustion degrades all tasks. If you have 8 independent tasks, split into waves of 5 and 3.

## Visible Dispatch Announcement (mandatory)

Before every `Task()` batch, emit a one-line user-visible header:

```
▶ Wave <N> — dispatching <M> agents in parallel: <role-a>, <role-b>, <role-c>
```

This header is non-optional. It is the user's only in-session signal that delegation is actually happening. Omitting it is treated as inline execution, which is prohibited under the "When NOT to Orchestrate" rule. A trailing recap line after all agents return is also expected:

```
◀ Wave <N> — <K>/<M> agents returned DONE (<list of roles>); synthesizing…
```

Keep the headers short. Use no emoji beyond the ▶ / ◀ markers.

## Subagent Prompt Crafting

Each `Task()` call must be self-contained:

- **Full context**: include all relevant file paths, code snippets, and constraints. Subagents do not share memory with each other or with you.
- **No assumed state**: never say "the file we discussed" -- name it explicitly.
- **Expected output format**: specify exactly what the subagent should return (e.g., "Return a JSON object with keys `file`, `changes`, `status`").
- **Scope boundary**: tell the subagent what is out of scope so it does not over-reach.

## Result Synthesis

When all subagents in a wave return:

1. **Merge outputs** into a unified result, deduplicating overlapping work.
2. **Resolve contradictions** -- if two subagents made conflicting changes to the same file, pick the one aligned with the original goal and discard the other.
3. **Flag gaps** -- identify any subtask that returned partial results or skipped part of its scope. Fill gaps in the next wave or escalate.

## Yielding While Agents Run

Do not yield with a bare "awaiting the others..." message while background agents are still in flight. Users see turn-end as session stop; background agents wake the session only via completion notifications, so a bare yield leaves the UI silent with no indication of progress.

Fill the waiting turn with non-blocking prep instead:

- **Read source files** the next dispatch wave will need — annotate paths, signatures, and relevant context so the next set of prompts is already informed.
- **Pre-verify assumptions** using dry-run CLI commands (e.g., `./bin/anvil.cjs route --json "<prompt>"`) to confirm current behaviour before issuing a tuning subagent.
- **Draft CHANGELOG entries and commit-message skeletons** for the work already returned.
- **Check git state** (`git status`, `git diff --stat`) to track what has landed.
- **Synthesize partial results** returned so far while others are still running.

If you must yield (e.g., nothing productive remains to prep), include agent IDs, task names, and what is still in flight: *"Waiting on agent-2 (selector tuning) and agent-3 (test tightening). agent-1 (banner wire-up) returned DONE."*

## Failure Handling

- **Single failure**: retry the failed subtask with additional context (e.g., the error message, a hint about the right approach).
- **Double failure** (same subtask fails twice): escalate to the user with a clear description of what failed and why.
- **Systemic failure** (multiple subtasks failing): stop all in-flight work and report. Do not keep dispatching into a broken environment.

## When NOT to Orchestrate

Orchestration is the default when three or more subtasks exist. You may only skip it when *all* of the following hold:

- The whole goal decomposes to ≤ 2 subtasks, **or** every subtask modifies the same single file.
- No subtask benefits from domain-specific agent selection (code-explorer, test-analyzer, etc.).

Sequential dependencies between *waves* are **not** a reason to skip orchestration — they are a reason to dispatch multiple waves. If the graph is plan → implement → test, that is three waves of Task() calls, not three inline steps. Orchestration is the default; inline execution must be justified, not the other way around.

Genuine inline-OK cases:
- Renaming a symbol across the current file and one import site.
- A one-line config flip followed by a single test.
- A single agent-type invocation (skip the orchestrator entirely — just `Task()` once).

If you catch yourself thinking *"but the steps depend on each other so I'll just do them"* — stop. That is the exact rationalization this rule was written to prevent. Dispatch the first wave.
