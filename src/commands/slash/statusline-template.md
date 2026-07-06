---
name: statusline-template
description: Read or set the active statusline rendering template (simple | rich)
argument-hint: "[<template>] [--json]"
user-invocable: false
---

# /statusline-template — Statusline template management

Use `/statusline-template` to read or change the active statusline rendering template without hand-editing `~/.anvil/models.json`.

The template controls which renderer is used to build the status bar in Claude Code. Two templates are available:

| Template | What it produces |
|---|---|
| `rich` | Truecolor RGB-gradient bar, emoji, repo + branch, code velocity, model · effort (default) |
| `simple` | Legacy tier-based render (minimal / default / maximal) |

## Read the current template

```
/statusline-template
```

Prints the active template and the source (`user` if set in `~/.anvil/models.json`, `default` otherwise).

```
/statusline-template --json
```

Machine-readable output: `{ "template": "rich", "source": "default" }`.

## Set a template

```
/statusline-template rich
/statusline-template simple
```

Writes `statusline.template` to `~/.anvil/models.json`, preserving all other fields. The change takes effect immediately on the next statusline render cycle.

## CLI counterpart

```
anvil statusline template [<template>] [--json]
```

This slash command is a direct alias for the CLI command above. The same validation rules apply: only `simple` and `rich` are accepted; any other value exits with code 2 and prints the valid set.

## Notes

- The template is a global (home-scoped) setting — it affects all projects on this machine.
- Default = `rich`. To opt back into the v0.9.1 simpler render, run `anvil statusline template simple`.
- `anvil doctor` shows the active template inline in the statusline tier row.
