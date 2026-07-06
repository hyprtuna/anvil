```markdown
---
spec: <slug>
version: "1"
title: <human-readable title>
date: <YYYY-MM-DD>
status: draft
related_plan: <plan file path, if known>
---

# <Title>

## Goal

<One paragraph: what this spec enables and why.>

## Context

<Relevant codebase state. Layer boundaries, existing abstractions, related files.>

## Assumptions

- A-001: <assumption>
- A-002: <assumption>
...

<decisions>
- id: D-01:
  title: <decision title>
  rationale: <why this choice over the alternative>

- id: D-02:
  title: <decision title>
  rationale: <why this choice over the alternative>
</decisions>

## Acceptance Criteria

- [ ] <verifiable criterion>
- [ ] <verifiable criterion>
...

## Out of Scope

- <explicitly excluded item>
- <explicitly excluded item>

## Open Questions

- (none)
```

The `<decisions>` block MUST use this exact format — one entry per `- id:` bullet with `title:` and `rationale:` fields on indented lines, and **decision IDs must follow the `D-NN:` convention** (`D-01:`, `D-02:`, …) — so that `anvil plan-check-decisions` can parse it correctly and `plan-verifier` can regex-match `covered_decisions`.
