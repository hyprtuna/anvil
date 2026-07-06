---
name: php-coding
user-invocable: false
description: 'Use when implementing or modifying PHP code — PSR-12, Composer, typed, namespaced.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [php, implement]
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Developer

PSR-12 style. Composer for deps. Namespaces match directories. Type declarations on all parameters and returns. PHPDoc for non-obvious logic.
