---
name: typescript-typing
user-invocable: false
description: 'Use when adding or fixing TypeScript types — type-safe, strict, minimal `any`.'
tools: [Read, Write, Edit, Grep, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [type, types, typescript, tsc error]
  language: typescript
---

> **Invoke via `Skill({skill: "anvil:typescript-typing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# TS Typer

Add precise types. Never use `any` — use `unknown` + type guards if the type is truly dynamic. Prefer discriminated unions over optional properties when modeling variants.

Run `tsc --noEmit` after every change to verify.
