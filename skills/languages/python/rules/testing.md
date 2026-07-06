---
name: python-testing-rules
user-invocable: false
description: 'Use when editing Python test code — pytest, parametrize, fixtures, isolated integration tests.'
tools: []
paths: [test_*.py, '*_test.py', tests/**/*.py]
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: python
---

> **Invoke via `Skill({skill: "anvil:python-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Python Testing

**Announce:** I'm using the python-testing-rules skill to inject Python testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **pytest is the standard** — use pytest for all test execution; `conftest.py` manages shared fixtures scoped to directories.
- **Use @pytest.mark.parametrize for data-driven tests** — pass test cases as parameter lists; keep the test body clean and focused.
- **Fixtures for setup/teardown** — use `@pytest.fixture` instead of `setUp()` methods; prefer function-scoped fixtures over class-based.
- **One assertion per test where practical** — isolate concerns; if multiple assertions are needed, group related checks logically.
- **Integration tests hit real databases when feasible** — use `pytest-postgresql` or test containers for realistic end-to-end coverage.
- **Mock at process/network boundaries only** — mock external services and APIs; test internal logic with real dependencies.
- **Run pytest -x --tb=short for fast feedback** — stop on first failure and use concise tracebacks during development; run full suite in CI.

## Why

pytest is Pythonic and flexible. Parametrize eliminates hand-rolled loops and improves test clarity. Fixtures are composable and reusable. One assertion per test isolates failure modes. Integration tests with real databases catch ORM/schema bugs. Selective mocking reduces brittleness. Fast feedback loops accelerate development.

## Done — status: DONE
