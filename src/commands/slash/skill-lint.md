---
name: skill-lint
description: Lint skills in project .claude/skills, ~/.anvil/skills, or an explicit path
argument-hint: "[--target <path>] [--json] [--strict]"
---

Lint skills for frontmatter validity, slug conventions, and pack integrity. Equivalent to `anvil skill lint`.

Scans (in order): project `.claude/skills/`, user `~/.anvil/skills/`, or an explicit `--target <path>`.

Use `--strict` to treat warnings as failures (CI mode).
Use `--json` for machine-readable output.
