---
name: debug
description: Invoke the debugging skill to investigate a bug systematically
argument-hint: "<issue...> [--tier <name>] [--model <id>]"
---

Invoke the `debugging` skill with the issue description.

Follow the 5-step debugging loop: reproduce → isolate → hypothesize → test → fix & verify.

If the user passes `--tier <name>` (e.g. `quick`, `coding`, `review`, `planning`, `ultra`, `super`), forward it to the CLI — it selects the model+effort pair for this invocation via the tier table.

If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer. `--model` wins over `--tier` when both are present.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] debug [--tier <name>] <issue>`
