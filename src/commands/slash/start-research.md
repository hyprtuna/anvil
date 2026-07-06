---
name: start-research
description: Start research on a topic — ecosystem patterns, library options, pitfalls
argument-hint: "<topic> [--depth quick|standard|deep] [--model <id>]"
---

Investigate a topic before implementation using the `deep-diving` skill.

1. Join all arguments into a topic string.
2. Determine depth: `quick` for single library confirmation, `standard` for 2-3 options comparison, `deep` for comprehensive parallel investigation.
3. If the user passes `--model <id>` (or `--effort <level>`), forward it to the CLI as a global flag — it routes through Anvil's per-invocation model resolver via the ENV layer.
4. Load the `deep-diving` skill + resolved model.
5. Run research and present findings with sources and trade-offs.

## Equivalent CLI

`anvil [--model <id>] [--effort <level>] start-research <topic> [--depth quick|standard|deep]`
