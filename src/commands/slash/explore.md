---
name: explore
description: Map the current repository (or a specific path) — structure, entry points, patterns
argument-hint: "[path] [--model <id>]"
---

Invoke `project-exploration`.

Maps top-level structure, entry points, testing setup, CI/CD, and notable patterns.

If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] explore [path]`
