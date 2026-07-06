---
name: python-coding-style-rules
user-invocable: false
description: 'Use when editing Python code — PEP 8, type hints on functions/classes, no bare except, pathlib over os.path.'
tools: []
paths: ['**/*.py']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: python
---

> **Invoke via `Skill({skill: "anvil:python-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Python Coding Style

**Announce:** I'm using the python-coding-style-rules skill to inject Python coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **PEP 8 compliance** — adhere to PEP 8; use `ruff check` and `black` in CI for automation.
- **Type hints on all public functions/classes** — every `def` and `class` at module level must have parameter and return type annotations; use `-> None` explicitly.
- **No bare `except:`** — catch specific exceptions only; never swallow errors without logging or re-raising.
- **Prefer dataclasses or Pydantic over dicts** — for structured records, use `@dataclass` or `pydantic.BaseModel`, never plain `dict`.
- **Use `pathlib.Path` instead of `os.path`** — `Path` is more readable and portable; always `from pathlib import Path`.
- **ruff + black + mypy in CI** — run `ruff check --fix`, `black --check`, and `mypy --strict` before merge; no type-ignore without error codes.
- **Consistent string formatting** — use f-strings for normal interpolation; use lazy `%s` formatting only in log calls.

## Why

PEP 8 and type hints prevent categories of runtime errors and make refactoring safer. Catching specific exceptions improves diagnostics. Dataclasses and Pydantic enforce data shape at the boundary. pathlib is the modern, cross-platform file API. Automated linting ensures consistency without review overhead.

## Done — status: DONE
