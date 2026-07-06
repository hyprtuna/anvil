---
name: ts-testing-rules
user-invocable: false
description: 'Use when writing TypeScript tests — Vitest, AAA pattern, no internal mocks, real databases.'
tools: []
paths: ['**/*.test.ts', '**/*.spec.ts']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: typescript
---

> **Invoke via `Skill({skill: "anvil:ts-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# TypeScript Testing Practices

**Announce:** I'm using the ts-testing-rules skill to inject TypeScript testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **Use Vitest (Jest fallback)** — Vitest is the project default; all tests use `.test.ts` or `.spec.ts` file extensions; Jest is acceptable only where explicitly required.
- **Arrange / Act / Assert (AAA) pattern** — each test has three phases: set up state (Arrange), call the function (Act), check results (Assert); keep them visually distinct.
- **Mock only at process/network boundaries** — never mock internal code; only mock HTTP calls, file I/O, and external services; internal mocks hide bugs that would fail in production.
- **Use real databases in integration tests** — when feasible, use a real database schema and transactions instead of mocked models; this catches ORM misuse and query bugs.
- **One assertion per test when practical** — group related assertions only when they test a single behavior; multiple independent assertions should be separate tests.
- **Use `describe(…)` blocks to group by behavior** — organize tests by the behavior being tested, not by function name; e.g., `describe('email validation', ...)` not `describe('isValidEmail', ...)`.
- **Snapshot tests are for serialized output only** — snapshots are acceptable for stable serialized outputs (JSON, XML, formatted strings); never use snapshots as a substitute for explicit assertions on logic.

## Why

Vitest is ES-module native and faster than Jest; AAA makes test intent clear at a glance. Mocking only at boundaries prevents tests from passing while production code fails. Real databases catch integration bugs that mocks can't. One assertion per test makes failure messages pinpoint the exact issue. Behavior-driven organization makes tests act as executable specifications. Snapshot tests prevent unintended changes to stable outputs but should not replace assertions on computed values.

## Done — status: DONE
