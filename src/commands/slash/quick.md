---
name: quick
description: Execute an ad-hoc task without full planning
argument-hint: "<description> [--validate] [--discuss] [--research] [--model <id>]"
---

Execute a task with lightweight planning using the `feature-development` skill.

1. Join all arguments into a task description.
2. Apply optional flags: `--validate` adds a verification step, `--discuss` gathers context first, `--research` investigates approach, `--save` saves the plan to `docs/`.
3. If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer.
4. Load the `feature-development` skill + resolved model.
5. Execute the task and present results.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] quick <description> [--validate] [--discuss] [--research] [--save]`
