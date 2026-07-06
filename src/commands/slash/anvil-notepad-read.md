---
name: anvil-notepad-read
description: Read notepad entries for the current branch — recent context or a specific section.
argument-hint: "[--section <learnings|decisions|issues|verification|problems>] [--branch <name>]"
experimental: true
allowed-tools:
  - Read
  - Bash
---

# /anvil:notepad-read

Read the current branch's notepad. Two modes:

- **Recent context (default):** Shows the auto-loaded summary of the most recent entries across all sections. Equivalent to what is injected at SessionStart.
- **Section read:** Pass `--section <name>` to read the full section file.

## Sections

- `learnings` — patterns and conventions discovered during the session
- `decisions` — architectural choices and rationale
- `issues` — active problems, blockers, and gotchas
- `verification` — test results and validation outcomes
- `problems` — unresolved debt and open questions

## Usage

```
anvil notepad read
anvil notepad read --section learnings
anvil notepad read --section decisions --branch feature/auth
```

## Equivalent CLI

`anvil notepad read [--section <name>] [--branch <name>]`

Use `--section` to read a full section instead of the recent-context summary.
