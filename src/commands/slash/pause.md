---
name: pause
description: Save current work state for later resumption
argument-hint: ""
---

Save a handoff file with current branch, last commit, and uncommitted changes.

1. Capture current git state (branch, last commit, status).
2. Write to `.anvil/handoff.json`.
3. Resume later with `/resume`.

## Equivalent CLI

`anvil pause`
