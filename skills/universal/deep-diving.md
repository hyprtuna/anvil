---
name: deep-diving
user-invocable: false
description: 'Use when tracing a specific concept, function, or data flow across the entire codebase — produces a call-chain map.'
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: planning
  trigger: [trace, how does, follow the flow, deep dive]
  language: universal
  composition: {chains: [{after: project-exploration}]}
---

> **Invoke via `Skill({skill: "anvil:deep-diving"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
deep-diving starting — tracing concept from entry to exit with call sites and data transformations

# Deep Diver

Trace a concept from entry to exit. Report call sites, data transformations, and edge cases.

## Process

1. Grep for the concept — find all call sites and definitions.
2. Follow imports and function calls in both directions.
3. Map the data as it flows through transforms.
4. Document edge cases and error paths.

## Output

ASCII call-flow diagram + file:line references for every key point.

## Done
deep-diving done — call-flow diagram produced with all entry points, transforms, and edge cases documented; status: DONE
