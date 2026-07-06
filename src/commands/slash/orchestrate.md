---
name: orchestrate
description: Invoke the orchestrator with optional parallel background fan-out
argument-hint: "<goal...> [--parallel=N]"
---

Invoke the `orchestrator` agent with optional `@parallel=N` background fan-out.

When `--parallel=N` is supplied (N 1..5), the orchestrator dispatches N independent background subagents simultaneously, writes each result to `.anvil/background-results.md`, then synthesizes a unified summary using the `read-background-results` skill.

If N > 5, it is clamped to 5 with a visible warning. Omitting `--parallel` (or using `--parallel=1`) runs the standard single-wave orchestration.

## Equivalent CLI

`anvil orchestrate <goal> --parallel <N>`

## Examples

```
anvil orchestrate "audit the auth module" --parallel 3
anvil orchestrate "explore performance bottlenecks" --parallel 5
anvil orchestrate "summarize open TODOs"
```
