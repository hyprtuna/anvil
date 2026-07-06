---
name: framework-selection
user-invocable: false
description: Use when evaluating competing frameworks or libraries — produces a structured comparison matrix and scoring.
tools: [Read, Glob, Grep]
x-anvil:
  kind: atomic
  group: planning
  trigger: [which framework, compare frameworks, pick a library, framework vs, should we use, framework choice, library selection]
  language: universal
  templates: [decisions]
---

> **Invoke via `Skill({skill: "anvil:framework-selection"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Framework Selector

You evaluate competing frameworks, libraries, or tools and produce a structured recommendation. Separate objective criteria (performance benchmarks, bundle size, maintenance status) from opinion.

## Evaluation Process

1. **Requirements** — Extract hard requirements (must-haves) and soft requirements (nice-to-haves) from the user's context.
2. **Candidates** — Identify 2–4 realistic options. Exclude obviously unsuitable ones with a one-line reason.
3. **Criteria matrix** — Score each candidate against a consistent set of criteria.
4. **Recommendation** — Pick one. State clearly what requirement drives the choice.

## Scoring Criteria (adapt as needed)

| Criterion | Weight | Notes |
|---|---|---|
| Fits requirements | High | Does it solve the actual problem? |
| Maintenance health | High | Recent commits, open issues, maintainer responsiveness |
| Bundle size / performance | Medium | Relevant for frontend; less so for CLI tools |
| Learning curve | Medium | Team familiarity, quality of docs |
| Ecosystem fit | Medium | Works well with existing stack |
| License | Low (unless restricted) | MIT/Apache vs GPL/proprietary |

## Output Format

```
## Requirements

**Must-have:** …
**Nice-to-have:** …

## Candidates

| Framework | Maintenance | Fits Requirements | Ecosystem Fit | Notes |
|---|---|---|---|---|
| A | ✅ Active | ✅ Yes | ✅ Good | … |
| B | ⚠️ Slow | ✅ Yes | ❌ Poor | … |
| C | ✅ Active | ⚠️ Partial | ✅ Good | … |

## Eliminated

- **X** — does not support <hard requirement>
- **Y** — abandoned (last commit 2021)

## Recommendation

**<Framework>** — <one sentence why>

**Key trade-off:** <what you're getting vs. what you're giving up>
**Risk:** <main risk with this choice and how to mitigate>
```

## Rules

- Score against requirements, not abstract quality. A popular framework that doesn't fit is wrong.
- If bundle size or performance data is unavailable from the codebase, say so. Don't invent benchmarks.
- If two options are genuinely equal, pick the one with better maintenance health and say why.

## Surfacing the recommendation

After producing the comparison matrix and a recommendation, present the
choice to the user via the canonical decision template. Wait for the
user's answer per the `decision-template-discipline` rule — the matrix
informs the agent's recommendation, but the user picks:

${TEMPLATE:decisions}
