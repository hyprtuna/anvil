---
name: anvil-notepad-write
description: Append an entry to the current branch's notepad in a specific section.
argument-hint: "--section <name> --headline <text> [--body <text>] [--source <skill>]"
experimental: true
allowed-tools:
  - Bash
---

# /anvil:notepad-write

Append a structured entry to the current branch's notepad. Entries are stored
per-branch under `.anvil/notepads/<branch-slug>/` and auto-loaded at SessionStart
within the 500-token budget.

## Sections

- `learnings` — patterns and conventions (typically written by researcher)
- `decisions` — architectural choices (typically written by code-architect or brainstorming)
- `issues` — active problems and blockers (typically written by debugging)
- `verification` — test/validation outcomes (typically written by code-reviewer or verification)
- `problems` — open questions and unresolved debt (typically written by orchestrator)

## Usage

```
anvil notepad write --section learnings --headline "CC additionalContext is model-visible"
anvil notepad write --section decisions --headline "Chose Path E over Path D" --source code-architect
anvil notepad write --section issues --headline "Missing chain entry in feature-development" --body "Need to add verification to chains.before"
```

## Equivalent CLI

`anvil notepad write --section <name> --headline <text> [--body <text>] [--source <skill>]`

The `--headline` is required and will be truncated to 80 characters. The `--source`
defaults to `cli` when not specified. Idempotent: the same headline+section written
on the same day is a no-op.
