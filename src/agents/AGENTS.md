# src/agents/ — AI Developer Notes

Layer 3. Agent runners for heavyweight orchestrators.

## Files

- `orchestrator.ts` — Tier 2 parallel fan-out. Decomposes a task, dispatches subtasks via `Task()`, collects results, synthesizes.
- `ultra-worker.ts` — Tier 3 autonomous. Builds a task graph, executes with plan → execute → verify → repeat loops.
- `runner.ts` — common invocation interface.

## Rules

- Agents are heavy. Default to skills; only add an agent when coordination cost justifies it.
- Prompt content for agents lives in `/agents/` (repo root). TypeScript here orchestrates invocation, not prompt content.
- `ultra-worker` must honor its `max_tokens` override (32K by default).
