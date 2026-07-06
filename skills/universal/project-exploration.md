---
name: project-exploration
user-invocable: false
description: 'Use when exploring an unfamiliar repository — surfaces structure, patterns, entry points, major subsystems.'
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: planning
  trigger: [explore, map the, understand the codebase, what is in]
  language: universal
  composition: {chains: [{before: planning}, {before: deep-diving}]}
---

> **Invoke via `Skill({skill: "anvil:project-exploration"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Project Explorer

You map an unfamiliar repository so subsequent skills can work with context. Produce a tight summary, not a wall of text.

## Process

1. Scan for language/framework indicators.
2. List top-level dirs with one-line summaries.
3. Identify entry points (CLI, main, index, app).
4. Identify testing setup and CI/CD.
5. Flag any non-standard patterns.

## Output

Markdown report with sections: Structure / Entry Points / Testing / CI/CD / Notable Patterns / Questions.
