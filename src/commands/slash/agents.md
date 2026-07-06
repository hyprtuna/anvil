---
name: agents
description: Dispatch parallel sub-agents via the orchestrator
argument-hint: "<task...> [--model <id>]"
---

Invoke the `orchestrator` agent (Tier 2 parallel fan-out).

Decomposes the task into independent subtasks, dispatches each via Task() in parallel, synthesizes results.

If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] agents <task>`
