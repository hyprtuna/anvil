---
name: php-testing-rules
user-invocable: false
description: 'Use when editing PHP test code — PHPUnit or Pest, AAA structure, data providers for parametric tests, real test database, no static method mocking.'
tools: []
paths: ['**/*.php']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Testing

**Announce:** I'm using the php-testing-rules skill to inject PHP testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **PHPUnit or Pest — pick one** — never mix in the same project. Pest's expectation API is closer to RSpec; PHPUnit is the long-standing default.
- **Arrange / Act / Assert sections** — separated by blank lines so readers can scan the test shape; one assertion idea per test.
- **Data providers for parameterized tests** — `#[DataProvider('cases')]`; never copy-paste tests with one literal changed.
- **Real test database** — SQLite in-memory if your app's SQL is portable, otherwise the production engine via docker-compose. Mocking the DB hides migration drift.
- **No static-method mocking** — refactor the static dependency into an injected interface. Static mocking via Mockery/AspectMock is a code-smell fix.
- **Behavior names** — `it_rejects_expired_tokens()` (PHPUnit snake_case) or `it('rejects expired tokens')` (Pest).
- **`tearDown` resets shared state** — never assume tests run isolated unless you reset DB state, fixtures, and global config.
- **No `sleep()` in tests** — for async expectations, poll with a deadline. `sleep` produces slow flaky tests.

## Why

Static method mocking patches at the class loader level — it bleeds across tests in the same suite and works against dependency injection. Real test databases catch SQL syntax errors, migration drift, and constraint violations that mocks silently pass. AAA sections make a test's intent visible without reading every line.

## Done — status: DONE
