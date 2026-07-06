---
name: changelog-generation
user-invocable: true
description: 'Use when assembling a release changelog from git history between two refs — emits a Conventional-Commits-shaped draft, filters noise, categorises by section.'
tools: [Bash, Read, Write]
x-anvil:
  kind: atomic
  group: documentation
  trigger: [changelog, release notes, what changed, generate changelog]
  language: universal
  templates: [changelogs]
---

> **Invoke via `Skill({skill: "anvil:changelog-generation"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Changelog Generator

Convert git commit history into a structured, human-readable changelog. Filters noise (test fixups, chore commits, formatting), categorizes meaningful changes, and formats the result as a Conventional Commits changelog section ready to paste into `CHANGELOG.md` or a release page.

## When to Use

- Preparing release notes before tagging a version.
- Generating weekly or sprint update summaries.
- Producing app-store update descriptions from git history.
- Auditing what changed between two commits or branches.

## Basic Usage

```
Generate a changelog since the last release tag
Generate changelog for all commits from the past week
Create release notes for v2.5.0
Changelog between v2.4.0 and HEAD
```

## Workflow

### 1. Resolve the range

Determine the commit range from the user's request:

- "since last release" → find the most recent tag: `git describe --tags --abbrev=0`
- "past N days" → `git log --since="N days ago"`
- "between vX and vY" → `git log vX..vY`
- Default range if unspecified: last tag to HEAD

### 2. Fetch commits

```bash
git log <range> --oneline --no-merges --format="%h %s"
```

Merge commits carry no information useful to changelog readers — exclude them.

### 3. Categorize and format

${TEMPLATE:changelogs}

### 4. Rewrite for readers

Transform technical commit messages into reader-oriented change descriptions:

- Remove issue numbers and PR references from the body (they can be added as footnotes).
- Lead with the user-visible effect, not the implementation detail.
- Use active present tense: "Adds", "Fixes", "Removes".
- Keep each entry to one line unless a breaking change requires context.

### 6. Present and confirm

Print the draft changelog to the conversation. Do not write to `CHANGELOG.md` automatically — ask the user to confirm or edit before appending.

## Options

**Custom style guide** — if the project has a `CHANGELOG_STYLE.md` or a style section in `CLAUDE.md`, read it before generating and match the format.

**Verbose mode** — include commit SHAs as footnotes for auditability.

**Internal mode** — include `chore:` and `refactor:` entries for internal release notes.

## Best Practices

- Run from the repo root so git commands resolve correctly.
- Review before publishing — automated categorization is ~85% accurate; catch the edge cases.
- If the commit log is noisy (many fixups, no Conventional Commits discipline), note this in the output and offer a summary instead of a line-by-line listing.
- Breaking changes always get their own section at the top, never buried in "Changed".

## Anti-patterns

- Including every commit verbatim — the changelog is for readers, not historians.
- Translating internal refactors into user-facing features — only include things users can observe.
- Omitting breaking changes or burying them in other sections.
- Writing entries in passive voice — prefer "Adds X" over "X was added".
