---
name: recommend
description: Recommend Anvil skills, agents, hooks, and MCPs based on detected project signals
argument-hint: [path]
---

Analyse the current project (or `[path]`) and recommend Anvil skills, agents, hooks, and MCPs that match the detected languages, frameworks, test runners, and CI providers. Read-only — does not install anything. Each recommendation includes a copy-pasteable `anvil init …` install hint.

## Usage

```
anvil recommend
anvil recommend ./path/to/project
anvil recommend --json
anvil recommend --top 5
anvil recommend --surface skills
anvil recommend --surface mcps
```

## Equivalent CLI

`anvil recommend [path] [--json] [--top N] [--surface skills|hooks|agents|mcps|all]`
