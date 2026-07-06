---
name: dispatching-parallel-agents
user-invocable: false
description: 'Use when 2+ independent failures need parallel agent dispatch — focused scope, explicit constraints per agent.'
tools: [Task, Read]
x-anvil:
  kind: composite
  group: orchestration
  trigger: [parallel agents, dispatch agents, run in parallel, multi-agent]
  language: universal
  tags: [orchestration, parallel, subagents, dispatch]
  aliases: [parallel dispatch, fan-out agents]
  composition: {chains: [{before: subagent-executor}]}
---

# Dispatching Parallel Agents

Investigating N unrelated failures sequentially costs N×solve-time. Give each
failure its own agent with isolated context and dispatch them together. Your
session stays free for integration work.

## The Core Rule

**One agent per independent problem domain.** If domains share state or one fix
might reveal another, investigate them together first. Parallelism is for
genuinely independent problems.

## When to Use

- 3+ test files failing with distinct root causes.
- Multiple subsystems broken independently after a refactor.
- Bulk audit work (e.g. "check every skill file for frontmatter drift").
- Each task can be stated without referencing the others.

## When NOT to Use

- Failures are related — fixing one may fix others. Investigate jointly.
- Tasks share the same files — agents will clobber each other's edits.
- You don't yet know what's broken. Explore first, dispatch second.
- Fewer than 2 independent tasks — overhead dominates.

## The Pattern

### 1. Identify independent domains

List failures, then group by subsystem. Ask: "Does fixing A affect B?" If no for
every pair, they're independent.

### 2. Write focused agent tasks

Each agent gets:
- **Scope** — one file, one subsystem, one artifact.
- **Goal** — a single observable outcome ("these tests pass", "this audit
  returns a JSON list").
- **Constraints** — what they must not touch. Be explicit.
- **Output contract** — exactly what they return to you.

### 3. Dispatch concurrently

Issue all `Task(...)` calls in a single assistant message so the runtime runs
them in parallel. Do not await one before issuing the next.

### 4. Integrate

When agents return:
- Read each summary.
- Check for file-overlap conflicts.
- Run the full suite / full audit.
- Spot-check one agent's work; systematic errors replicate.

## Agent Prompt Structure

A good dispatch prompt is **focused**, **self-contained**, and **explicit about
output**:

```
Fix the 3 failing tests in src/agents/agent-tool-abort.test.ts.

Failures:
- "should abort tool with partial output capture" — expects 'interrupted at' in message
- "should handle mixed completed and aborted tools" — fast tool aborted instead of completed
- "should properly track pendingToolCount" — expects 3 results, got 0

These look like timing / race issues.

Constraints:
- Do NOT change tests in other files.
- Do NOT just raise timeouts — find the real cause.
- Do NOT refactor unrelated code.

Return: a one-paragraph root-cause summary plus the list of files changed.
```

## Common Mistakes

- **Scope too broad.** "Fix all the tests" gives the agent no anchor. Name a file.
- **No context.** "Fix the race condition" — which one, where? Paste the error.
- **No constraints.** Agent refactors half the repo because you didn't say not to.
- **Vague output.** "Fix it" leaves you with no handle on what changed. Demand a
  structured summary.
- **Dispatching mid-investigation.** If you don't know the domains yet, explore
  first; don't split confusion into three confused agents.

## Shared State Red Flags

Refuse to parallelize if any agent would:
- Edit a file another agent also edits.
- Hold an exclusive resource (database, port, lockfile).
- Depend on another agent's output mid-run.

Shared state means sequential. No exceptions — race conditions between agents
waste more time than any parallelism saves.

## Integration with Anvil

- `agents/subagent-executor.md` executes a single dispatched task; this skill
  decides when to issue several at once.
- `skills/universal/orchestrator.md` coordinates the returned results.
- Pair with `using-git-worktrees` when agents need isolated workspaces to avoid
  filesystem conflicts.
