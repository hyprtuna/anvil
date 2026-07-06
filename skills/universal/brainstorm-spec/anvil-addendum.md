# brainstorm-spec — Anvil Spec Addendum

> This addendum is loaded when the user picks **Anvil-spec** or **Both** as the spec format
> (Q2), regardless of which location was chosen in Q1. It extends the generic brainstorm-spec
> body with Anvil-specific decisions block grammar, D-NN decision ID convention, SDD layout
> requirements, and plan-verifier compliance rules.

## When This Addendum Applies

The user chose **Anvil-spec** or **Both** as the format (Q2). This triggers:

1. If location is `${ANVIL_FEATURES_DIR}/<slug>/`: bootstrap with `mkdir -p ${ANVIL_FEATURES_DIR}/<slug>/` (silent, no confirmation needed).
2. Apply the Anvil spec format defined below, including the `<decisions>` block.
3. `anvil plan-check-decisions` integration is active — every decision ID must be traceable from the plan.
4. `plan-verifier` compliance rules apply when the linked plan is validated.

## Mandatory `<decisions>` Block

Every Anvil spec MUST include a `<decisions>` block using this grammar:

```markdown
<decisions>

D-01: <Short decision title>
  Question: <The design question being decided>
  Options:
    A. <Option A description>
    B. <Option B description> (chosen)
  Rationale: <Why option B was chosen>

D-02: <Short decision title>
  Question: <The design question being decided>
  Options:
    A. <Option A description> (chosen)
    B. <Option B description>
  Rationale: <Why option A was chosen>

</decisions>
```

### D-NN Decision ID Format

Decisions are identified using the format `D-NN` where `NN` is a zero-padded two-digit number
starting at `D-01`. When `plan-writing` references a spec decision in a plan task, it uses the
exact `D-NN:` ID as it appears in this spec's `<decisions>` block.

`plan-verifier` performs a regex lookup on `must_haves.covered_decisions` to verify every
`D-NN:` ID from this spec's `<decisions>` block is addressed by the plan. A missing or
malformed ID breaks that lookup.

**You must produce at least one `D-NN:` decision for any non-trivial Anvil spec.**

## YAML Frontmatter Schema

Anvil specs MUST include YAML frontmatter:

```yaml
---
title: "<Feature Name>"
slug: "<kebab-slug>"
created: "<ISO-date>"
status: "draft"
related_plan: ""          # filled after plan-writing runs
decisions_count: N        # number of D-NN decisions in the <decisions> block
---
```

## SDD Layout

When writing to `${ANVIL_FEATURES_DIR}/<slug>/`, follow the SDD directory layout:

```
.anvil/specs/features/<slug>/
  spec.md          ← this file (the Anvil spec)
  plan.md          ← produced by plan-writing (after spec approval)
```

`ultra-worker` and `orchestrator` look for a spec at `related_spec:` in the plan frontmatter
or passed explicitly as `Spec file: <path>`. The path `${ANVIL_FEATURES_DIR}/<slug>/spec.md`
is the canonical location the hard-gate checks resolve to.

## Anvil Spec Full Format

```markdown
---
title: "Feature Name"
slug: "feature-name"
created: "YYYY-MM-DD"
status: "draft"
related_plan: ""
decisions_count: 2
---

## Goal

<One paragraph: what the feature does and why it is needed.>

## Context

<Codebase summary relevant to the goal: relevant existing files, patterns, constraints.>

## Assumptions

- A-001: <assumption> — evidence: <file:line or grep pattern>
- A-002: <assumption> — evidence: <file:line or grep pattern>

<decisions>

D-01: <Short decision title>
  Question: <The design question being decided>
  Options:
    A. <Option A>
    B. <Option B> (chosen)
  Rationale: <Why option B>

</decisions>

## Acceptance Criteria

- <Machine-verifiable criterion 1>
- <Machine-verifiable criterion 2>

## Out of Scope

- <Explicit exclusion 1>
- <Explicit exclusion 2>

## Open Questions

- (none)
```

## assumptions-surfacer Integration

After producing the initial spec draft and `<decisions>` block, dispatch the
`assumptions-surfacer-prompt.md` sub-task. Any assumption it marks `elevation: yes`
MUST become a `D-NN:` decision in this spec before `plan-writing` runs.

The sub-task chain is:
```
brainstorm-spec → assumptions-surfacer → [D-NN elevations] → plan-writing → plan-verifier
```

## plan-verifier Compliance

Once the linked plan is written, `anvil plan-validate <plan-file>` verifies:
- Every `D-NN:` ID from this spec's `<decisions>` block appears in `covered_decisions` of the plan.
- `related_spec:` field in the plan frontmatter points to this spec file.

Run `anvil plan-check-decisions <plan-file>` to check decision coverage before committing the plan.

## Quality Checklist (Anvil-specific additions)

In addition to the base quality checklist, for Anvil specs also verify:

- [ ] Every decision follows the four-part structure (Question / Options / chosen / Rationale).
- [ ] All decision IDs follow the `D-NN:` convention (`D-01:`, `D-02:`, …).
- [ ] The `<decisions>` block is syntactically valid (parseable by `anvil plan-check-decisions`).
- [ ] `decisions_count` in frontmatter matches the actual number of `D-NN:` entries.
- [ ] The spec path matches the `related_spec:` field the plan will reference.
