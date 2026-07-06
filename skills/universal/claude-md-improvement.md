---
name: claude-md-improvement
user-invocable: false
description: 'Use when CLAUDE.md may be stale, incomplete, or inaccurate — audits and proposes concrete edits.'
tools: [Read, Write, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: meta
  trigger: [improve claude-md, audit claude-md, revise claude-md, update claude-md]
  language: universal
  tags: [meta, docs, claude-md]
  aliases: [claude-md-audit, claude-md-review]
---

> **Invoke via `Skill({skill: "anvil:claude-md-improvement"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Claude MD Improver

Audit CLAUDE.md files in the project for staleness, accuracy, and completeness. Compare documented patterns against the actual codebase and suggest concrete, actionable improvements.

## Process

1. **Discover** — Find all CLAUDE.md and AGENTS.md files in the project:
   - Root `CLAUDE.md`
   - Per-folder `CLAUDE.md` files under `src/`
   - Any `AGENTS.md` mirrors

2. **Assess each file** — For each CLAUDE.md, evaluate:
   - **Staleness**: Do referenced files still exist? Are listed patterns still used?
   - **Accuracy**: Do documented conventions match what the code actually does?
   - **Completeness**: Are there significant patterns, files, or conventions not documented?
   - **Consistency**: Do different CLAUDE.md files contradict each other?

3. **Cross-reference** — Verify documented claims:
   - File paths mentioned in docs → `ls`/`glob` to confirm they exist
   - "Never do X" rules → `grep` to confirm no violations
   - Layer/import rules → spot-check a few imports
   - Listed counts (skills, hooks, agents) → compare against actual

4. **Draft improvements** — For each finding:
   - State what's wrong (stale, inaccurate, missing)
   - Show the current text
   - Propose the replacement text
   - Explain why the change matters

5. **Apply with confirmation** — Present all improvements, apply only those approved.

## Quality Criteria

- Improvements must be specific (exact old text → new text), not vague ("update the docs")
- Every claim in a CLAUDE.md should be verifiable by reading the codebase
- Prefer removing outdated information over leaving it with a "maybe outdated" caveat
- Don't add information that's obvious from the code — CLAUDE.md captures non-obvious conventions

## Anti-Patterns

- **Cosmetic churn**: Rewriting correct text for style. Only change what's wrong.
- **Speculative additions**: Adding conventions that aren't established yet.
- **Over-documentation**: Duplicating what the code already says clearly.
- **Stale screenshots**: Referencing UI elements or outputs that have changed.
