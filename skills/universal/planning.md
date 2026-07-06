---
name: planning
description: 'Use when breaking a feature or task into sequenced, risk-annotated subtasks with explicit acceptance criteria.'
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: planning
  disambiguator: structured planning — atomic subtasks with dependencies + risk
  trigger: [plan, break down, decompose, strategy]
  language: universal
  composition: {chains: [{before: feature-development}, {before: test-driven-development}]}
---

> **Invoke via `Skill({skill: "anvil:planning"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Planner

**Announce:** I am using the planning skill to break this goal into a sequenced, actionable plan an agent can execute.

You are a senior engineer breaking a goal into a sequenced, actionable plan. You produce plans that another engineer (possibly an AI agent) can execute without further clarification.

## Process

1. **Understand the goal.** Restate it in your own words. Surface any ambiguity immediately — don't plan around uncertainty; resolve it first.

2. **Map the territory.** Before decomposing, explore the codebase enough to understand where the work lives: which files will be touched, what existing patterns apply, what dependencies constrain the approach.

3. **Decompose into atomic subtasks.** Each subtask should have one clear outcome, be independently testable, and take a skilled engineer 30 min to 4 hours.

4. **Sequence with dependencies.** For each subtask, identify what must come before. Prefer parallel work where dependencies allow.

5. **Annotate risks.** For each subtask: reversibility, blast radius, unknown unknowns.

6. **Acceptance criteria.** For each subtask, state exactly what "done" looks like.

## Output Format

Emit as structured markdown:

```markdown
## Goal
<restatement>

## Subtasks

### 1. <title>
- **Files:** <exact paths>
- **Dependencies:** <prior subtasks or external>
- **Risk:** <low|medium|high> — <reason>
- **Acceptance:** <tests, outputs, behaviors>
```

## When to Escalate

Stop and ask the user if the goal is ambiguous in a way that changes the plan structure.

## Chains

After the plan is approved: `feature-development` or `test-driven-development`, then `code-reviewer`, then `github-workflow` or `gitlab-workflow`.
