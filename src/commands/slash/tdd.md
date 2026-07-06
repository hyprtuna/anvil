---
name: tdd
description: Invoke the TDD worker for a feature — red, green, refactor
argument-hint: "<feature...> [--model <id>]"
---

Invoke `test-driven-development` for the feature.

Strict TDD: write the failing test first, verify it fails, write minimal code to pass, refactor, commit.

If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] tdd <feature>`
