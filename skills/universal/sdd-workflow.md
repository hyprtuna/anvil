---
name: sdd-workflow
user-invocable: false
description: 'Use when starting a new feature from scratch — orchestrates brainstorm-spec → plan-writing → implementation under the Spec-Driven Development discipline, parallel to TDD'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: planning
  trigger: [sdd, spec-driven, start a feature, new feature from scratch, design first, spec then plan]
  language: universal
  tags: [sdd, spec, plan, workflow, design-first]
  aliases: [spec-driven development, sdd workflow, design-first development]
  composition: {sub_skills: [brainstorm-spec, plan-writing]}
---

> **Invoke via `Skill({skill: "anvil:sdd-workflow"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
sdd-workflow starting — spec-driven development cycle; drafting spec before any planning or implementation begins

# SDD Worker

Strict spec-driven development. Every implementation plan exists because an approved spec demanded it.

---

## The SDD Gate

<HARD-GATE phase="idea→spec">
DO NOT write implementation files, create plan files, or invoke plan-writing until the
user has reviewed and explicitly approved the spec produced by brainstorm-spec.

The intent of this gate is that no planning or implementation work begins before
the spec's assumptions, decisions, and acceptance criteria are agreed upon.

This gate lifts ONLY when the user responds with explicit confirmation:
"approved", "looks good, proceed to plan", "go ahead", or equivalent.
A vague acknowledgment ("ok", "sure", "yes") is not approval.

Gate checklist before exiting:
- [ ] brainstorm-spec has produced a spec with all required sections
- [ ] ## Open Questions section is present (even if empty: "- (none)")
- [ ] User has given explicit approval before plan-writing is invoked
</HARD-GATE>

---

## The SPEC → PLAN → IMPLEMENT Cycle

Every feature follows this pipeline. In order. No skipping.

---

### SPEC Phase: Draft the Spec

Invoke `brainstorm-spec` to transform the under-specified goal into a rigorous spec.

The spec produced must contain:
- **Goal** — what the feature accomplishes in one sentence
- **Context** — why this is needed now
- **Assumptions** — what is assumed true; each must be falsifiable
- **Decisions block** — explicit decisions locked before planning
- **Acceptance Criteria** — observable, testable outcomes
- **Open Questions** — unresolved matters (even if empty)
- **Out of Scope** — what is explicitly excluded

The brainstorm-spec skill handles the full spec-writing process. Your role here is
to pass the user's goal and any context to it, then gate on approval.

---

### VERIFY SPEC (Mandatory)

After brainstorm-spec completes:

1. **Present the spec to the user.**
2. **Solicit explicit approval.** Do not proceed to planning without it.
3. **If questions are raised:** loop back to brainstorm-spec with the feedback.
4. **Only after approval:** proceed to the PLAN phase.

---

### PLAN Phase: Write the Implementation Plan

Once the spec is approved, invoke `plan-writing` to produce a phase-ordered
implementation plan.

The plan must contain:
- MustHaves frontmatter linking back to the spec
- Ordered phases, each independently verifiable
- Verification gates at each phase boundary
- A clear exit criterion for the entire plan

---

### VERIFY PLAN (Mandatory)

Before any implementation begins:

1. **Review the plan structure** — are phases ordered logically?
2. **Verify acceptance criteria coverage** — does every AC in the spec map to at least one plan task?
3. **Check for implicit assumptions** — does the plan assume anything not stated in the spec?
4. **If concerns exist:** raise them before proceeding. Fix the plan, not the code.

---

### IMPLEMENT Phase: Execute Under Discipline

With an approved spec and verified plan, implementation begins under the existing
skills chain — `test-driven-development`, `code-review`, etc.

The spec is the authority. When implementation diverges from spec:
- Stop and decide: is the divergence intentional?
- If yes: update the spec and get approval before continuing.
- If no: bring implementation back in line with the spec.

The plan is the schedule. When a phase cannot be completed as written:
- Do not skip phases silently.
- Record the blocker and surface it.

---

### COMMIT: Lock Each Phase

After every verified phase in the plan:
- Commit with a message describing the behavior added.
- Each commit is a safe point you can return to.

---

## SDD vs TDD — Relationship

SDD and TDD are complementary, not competing:

| Concern | Governs |
|---|---|
| **SDD** | What to build and why (spec → plan → implement) |
| **TDD** | How to build it correctly (red → green → refactor) |

An SDD-governed feature uses TDD for its implementation. SDD operates at the
feature scope; TDD operates at the code scope.

---

## Red Flags — Stop If You Catch Yourself:

| Red Flag | What It Really Means |
|---|---|
| Writing a plan before the spec is approved | You are guessing at scope |
| Writing code before the plan phase | You are skipping the design gate |
| Updating the implementation without updating the spec | Your spec is a lie |
| "I'll spec it after I build it" | You will not. And the spec will be a rationalization, not a design. |
| "The feature is simple, no spec needed" | Simple features have simple specs. Write it. |
| Skipping Open Questions because there are none | Write "- (none)" — the absence is the answer |
| "The plan is obvious from the spec" | Then writing the plan is fast. Write it. |

---

## Workflow Summary

```
1. Receive the feature goal.
2. Invoke brainstorm-spec.            [SPEC]
3. Present spec; await approval.      [GATE]
4. Invoke plan-writing.               [PLAN]
5. Review plan for AC coverage.       [VERIFY PLAN]
6. Execute plan under TDD discipline. [IMPLEMENT]
7. Commit each verified phase.        [COMMIT]
8. Repeat from 2 for the next feature.
```

---

## SDD Checklist (Quick Reference)

- [ ] brainstorm-spec invoked before any planning.
- [ ] Spec has all required sections (Goal, Context, Assumptions, Decisions, AC, Open Questions, Out of Scope).
- [ ] Explicit user approval received before plan-writing.
- [ ] plan-writing invoked only after spec approval.
- [ ] Every AC in the spec maps to at least one plan task.
- [ ] No implementation code written before the plan is verified.
- [ ] Each phase committed at green.

## Done
sdd-workflow done — spec → plan → implement cycle complete; all phases verified; status: DONE
