---
name: code-tour
user-invocable: false
description: Use when producing a CodeTour-format `.tour` file for a persona-targeted walkthrough — anchors steps to real files and line numbers.
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: exploration
  trigger: [code tour, tour this, walkthrough, onboarding tour]
  language: universal
---

# Code Tour

Produce `.tours/` JSON files that open directly to real files and line ranges. A tour is a narrative for a specific reader — what they are looking at, why it matters, and what to look at next. Write tours for humans, not for indexing.

## When to Use

- User asks for a code tour, architecture walkthrough, or PR tour.
- User says "explain how X works" and wants a reusable guided artifact.
- Onboarding a new contributor who will be reading code independently.
- Post-incident: trace a failure path as a reviewable artifact.

Do NOT produce a tour when a single chat answer suffices or when the user wants prose documentation rather than a `.tour` file.

## Workflow

### 1. Discover first

Before writing any steps, explore the repo:

- README and entry points
- Top two levels of the directory tree
- Relevant config files
- Changed files if this is a PR tour

Do not write a single step until you understand the shape of the code.

### 2. Choose the reader persona

| Request shape | Persona | Step count |
|---|---|---|
| "onboarding", "new joiner" | new-joiner | 9–13 |
| "quick tour", "vibe check" | vibecoder | 5–8 |
| "architecture" | architect | 14–18 |
| "tour this PR" | pr-reviewer | 7–11 |
| "why did this break" | rca-investigator | 7–11 |
| "explain how X works" | feature-explainer | 7–11 |

### 3. Verify every anchor

Every `file` path and `line` number must be real:

- Confirm the file exists with Glob.
- Confirm the line is in range with Read (offset + limit 1).
- Never guess line numbers. Use `pattern` anchors for volatile files.

### 4. Write the tour

Output path: `.tours/<persona>-<focus>.tour`

### 5. Validate before finishing

- Every referenced path exists.
- Every line is in range.
- The first step anchors to a real file or directory (not content-only).
- The tour reads as a path, not an inventory.

## Step Types

**File + line** (default):
```json
{ "file": "src/auth/middleware.ts", "line": 42, "title": "Auth Gate", "description": "Every protected request passes here first." }
```

**Directory** (orientation):
```json
{ "directory": "src/services", "title": "Service Layer", "description": "Orchestration logic lives here." }
```

**Selection** (one block matters more than the whole file):
```json
{ "file": "src/core/pipeline.ts", "selection": { "start": { "line": 15, "character": 0 }, "end": { "line": 34, "character": 0 } }, "title": "Request Pipeline" }
```

**Pattern** (volatile files):
```json
{ "file": "src/app.ts", "pattern": "export default class App", "title": "Application Entry" }
```

**Content** (closing step only):
```json
{ "title": "Next Steps", "description": "You can now trace the request path end to end." }
```

## Description Rule

Each step description should answer:
- **Situation** — what the reader is looking at
- **Mechanism** — how it works
- **Implication** — why it matters for this persona
- **Gotcha** — what a careful reader might miss

Keep descriptions compact and grounded in the actual code.

## Narrative Shape

1. Orientation (entry point or top-level directory)
2. Module map
3. Core execution path
4. Edge case or gotcha
5. Closing / what the reader can now do

## Anti-patterns

| Anti-pattern | Fix |
|---|---|
| Flat file listing | Build a narrative dependency between steps |
| Generic descriptions | Name the concrete code path |
| Guessed anchors | Verify every file and line |
| Too many steps for a quick tour | Cut aggressively |
| First step is content-only | Anchor to a real file or directory |
| Wrong persona depth | Write for the actual reader |
