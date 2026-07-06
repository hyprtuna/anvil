---
name: finish
description: Complete a development branch — verify tests, then merge, open a PR, keep, or discard
argument-hint: "[--mode merge|pr|keep|discard] [--yes] [--dry-run]"
---

Finish the current development branch after verifying tests pass.

1. Run `npm test` — abort if any tests fail.
2. Detect the current branch and base branch (`main` or `master`).
3. Present four options: open a pull request, merge into base, keep as-is, or discard.
4. Execute the chosen action.

## Equivalent CLI

`anvil finish`

Use `--mode pr|merge|keep|discard` to skip the interactive prompt.
Use `--yes` to default to PR without prompting.
Use `--dry-run` to preview what would happen without making changes.
