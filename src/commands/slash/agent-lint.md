---
name: agent-lint
description: Lint agents in project .claude/agents, ~/.anvil/agents, or an explicit path
argument-hint: "[--target <path>] [--json] [--strict]"
---

Lint agents for frontmatter validity, slug conventions, and naming discipline. Equivalent to `anvil agent lint`.

Scans (in order): project `.claude/agents/`, user `~/.anvil/agents/`, or an explicit `--target <path>`.

Use `--strict` to treat warnings as failures (CI mode).
Use `--json` for machine-readable output.
