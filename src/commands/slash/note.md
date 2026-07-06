---
name: anvil-note
description: Zero-friction idea capture. Append, list, or promote notes to todos.
argument-hint: "<text> | list | promote <file>"
experimental: true
allowed-tools:
  - Read
  - Write
  - Glob
  - Grep
  - Bash
---

# /anvil:note

Capture ideas without interrupting flow. Three modes:

- **Append (default):** `anvil note "refactor the auth guard"` writes a timestamped markdown file under `.anvil/notes/`.
- **List:** `anvil note list` shows every saved note, newest first.
- **Promote:** `anvil note promote <file>` converts a note to a Markdown todo block that you can paste into a plan or PR description.

The CLI counterpart is `anvil note` (see `src/commands/cli/note.ts`). Slash and CLI stay in parity per Anvil's command contract.
