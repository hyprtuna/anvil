---
name: fastapi-coding
user-invocable: false
description: 'Use when implementing or modifying FastAPI services — Pydantic v2, dependency injection, async endpoints.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [fastapi, implement]
  language: fastapi
---

> **Invoke via `Skill({skill: "anvil:fastapi-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# FastAPI Developer

Pydantic v2 for request/response models. Dependency injection for shared setup. Async endpoints unless the library is sync-only.
