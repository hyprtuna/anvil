---
name: python-testing
user-invocable: false
description: 'Use when writing or extending Python tests — pytest, parametrize, fixtures.'
tools: [Read, Write, Edit, Bash, Grep]
x-anvil:
  kind: atomic
  group: testing
  trigger: [test python, pytest, test]
  language: python
---

> **Invoke via `Skill({skill: "anvil:python-testing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Python Tester

pytest by default. Parametrize over repeat. Fixtures for setup. No hidden state between tests.
