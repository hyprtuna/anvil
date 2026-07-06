---
name: spring-coding
user-invocable: false
description: 'Use when implementing or modifying Spring apps — constructor injection, profile-based config, explicit @Transactional.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [spring, spring boot, implement]
  language: spring
---

> **Invoke via `Skill({skill: "anvil:spring-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Spring Developer

Constructor injection only (no field injection). Profile-based config. `@Transactional` explicit on service methods.
