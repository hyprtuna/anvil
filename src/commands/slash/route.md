---
name: route
description: Show routing diagnostics for a prompt — top intents, recommended skills and agent
argument-hint: <prompt>
---

Diagnose how Anvil would route the given prompt through the intent pipeline.

Prints the top detected intents (with scores and matched keywords), the recommended skill bundle, and the selected agent.

## Usage

```
anvil route <prompt>
anvil route --json <prompt>
anvil route --no-color <prompt>
```

## Equivalent CLI

`anvil route <prompt>`
