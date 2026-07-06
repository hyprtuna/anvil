---
name: review
description: Invoke the code-review skill via the code-reviewer agent on staged changes or a target
argument-hint: "[target] [--type <type>] [--tier <name>] [--model <id>]"
---

Invoke the `code-review` skill via the `code-reviewer` agent.

1. If an argument is provided, use it as the target (file path or glob).
2. If no argument, default to `staged` (review `git diff --cached`).
3. If the user passes `--type <type>` (`spec-compliance`, `code-quality`, or `both`), forward it to the CLI — it controls which review pass runs. Default is `both`.
4. If the user passes `--tier <name>` (e.g. `quick`, `coding`, `review`, `planning`, `ultra`, `super`), forward it to the CLI — it selects the model+effort pair for this invocation via the tier table.
5. If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer. `--model` wins over `--tier` when both are present.
6. Load the `code-review` skill + resolved model, dispatched via the `code-reviewer` agent.
7. Run the review and present findings with file:line, severity, and suggested fix.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] review [target] [--type <type>] [--tier <name>]`
