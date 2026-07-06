---
name: revise-claude-md
description: Audit and improve CLAUDE.md files — find stale, inaccurate, or missing content
argument-hint: "[--focus AREA] [--scope project|global]"
---

Audit all CLAUDE.md and AGENTS.md files in the project for staleness, accuracy, and completeness. Cross-references documented conventions against the actual codebase and proposes concrete improvements.

1. Discovers all CLAUDE.md files (root + per-folder)
2. Assesses each for staleness, accuracy, completeness
3. Cross-references claims against the codebase
4. Proposes specific old→new text replacements
5. Applies approved changes

## Equivalent CLI

`anvil revise-claude-md [--focus AREA] [--scope project|global]`
