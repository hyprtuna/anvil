```markdown
---
plan: <sequential number>
version: v<major.minor.patch>
title: <concise title>
date: <YYYY-MM-DD>
related_spec: <path to spec doc or "" if none>
depends_on: [<plan IDs this depends on, or empty list>]
effort: XS | S | M | L | XL
---

# Plan: [concise title]

**Goal:** [one-sentence statement of what this plan achieves]
**Architecture:** [which layers / modules are touched]
**Tech Stack:** [languages, frameworks, key libraries]
**Test Framework:** [vitest/jest/pytest/etc.]
**Conventions:** [key rules from CLAUDE.md that affect this work]

## Tasks

### Task 1: [verb-noun title, e.g. "Create config schema"]
**Files:** [exact paths — create/modify/delete]
**Action:** [complete description with actual code or precise instructions]
**Verification:** [exact command to run + expected output pattern]
**Acceptance:** [concrete criteria — not "it should work"]

Steps (executor tracks these):
- [ ] [step 1 — one concrete action]
- [ ] [step 2 — one concrete action]
- [ ] Commit: `<conventional-commit message>`

### Task 2: [title]
...
```

### Required header fields

| Field | Required | Description |
|---|---|---|
| `plan` | yes | Sequential plan number |
| `version` | yes | Target release version (`v0.7.0`) |
| `title` | yes | Short descriptive title |
| `date` | yes | Authoring date (YYYY-MM-DD) |
| `related_spec` | yes | Path to spec doc; empty string if none |
| `depends_on` | yes | List of prerequisite plan IDs; empty list if none |
| `effort` | yes | XS / S / M / L / XL |
