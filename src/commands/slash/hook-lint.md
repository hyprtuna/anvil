---
name: hook-lint
description: Lint hooks in project .claude/hooks, ~/.anvil/hooks, or an explicit path
argument-hint: "[--target <path>] [--json] [--strict]"
---

Lint hooks for schema validity and configuration correctness. Equivalent to `anvil hook lint`.

Scans (in order): project `.claude/hooks/`, user `~/.anvil/hooks/`, or an explicit `--target <path>`.

Use `--strict` to treat warnings as failures (CI mode).
Use `--json` for machine-readable output.
