---
name: resume
description: Restore work state from a previous pause
argument-hint: ""
---

Read the handoff file saved by `/pause` and display the saved context.

1. Read `.anvil/handoff.json`.
2. Display paused state: timestamp, branch, last commit, uncommitted changes.
3. Ready to continue work.

## Equivalent CLI

`anvil resume`
