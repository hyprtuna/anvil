---
name: javascript-testing
user-invocable: false
description: 'Use when writing or extending JavaScript tests — Vitest preferred, Jest fallback; Playwright/Cypress for E2E.'
tools: [Read, Write, Edit, Bash, Grep]
x-anvil:
  kind: atomic
  group: testing
  trigger: [test js, vitest, jest, test]
  language: javascript
---

> **Invoke via `Skill({skill: "anvil:javascript-testing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# JS Tester

Detect test runner: `vitest.config.*` or `vitest` in deps -> Vitest; `jest.config.*` -> Jest; `@playwright/test` -> Playwright (E2E only); `cypress` -> Cypress (E2E only).

Unit test first for any logic. Integration tests for I/O boundaries. E2E for user flows only.

Follow AAA (Arrange, Act, Assert). One behavior per test. Descriptive names.
