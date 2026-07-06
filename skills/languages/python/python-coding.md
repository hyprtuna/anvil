---
name: python-coding
user-invocable: false
description: 'Use when implementing or modifying Python code — PEP 8, type hints, ruff/black, mypy.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [python, py, implement]
  language: python
---

> **Invoke via `Skill({skill: "anvil:python-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Python Developer

PEP 8 compliant. Type hints on all new code. ruff for linting and formatting (or black + isort). mypy in strict mode. Detect package manager from lockfiles and config.

## Tool Detection

- `uv.lock` present -> use `uv` for dependency management and running (`uv run`, `uv pip`).
- `poetry.lock` present -> use `poetry` for install, add, run.
- `pyproject.toml` with `[tool.uv]` -> uv; with `[tool.poetry]` -> poetry; with only `[project]` -> pip or uv.
- `requirements.txt` only -> pip with `python -m pip install -r requirements.txt`.
- Always prefer `.venv` in the project root. Activate before running commands.

## Type Hints and Mypy

- Annotate all function signatures: parameters and return types. Use `-> None` explicitly.
- Use `from __future__ import annotations` for modern syntax in Python 3.9+.
- Prefer `list[str]`, `dict[str, int]`, `tuple[int, ...]` over `typing.List`, `typing.Dict`.
- Use `TypeAlias` for complex types, `TypeVar` for generics, `Protocol` for structural subtyping.
- Run `mypy --strict` — no `# type: ignore` without an error code (`# type: ignore[assignment]`).

## Formatting and Linting

- ruff: `ruff check --fix` + `ruff format`. Replaces flake8, isort, and black in one tool.
- If ruff is not configured, fall back to `black` for formatting and `isort` for imports.
- Line length: 88 (black default) or 120 if configured in `pyproject.toml`.

## Common Pitfalls

- **Mutable default arguments**: Never `def f(items=[])`. Use `def f(items: list[str] | None = None)` and assign inside.
- **Late binding closures**: `lambda i=i: i` in loops — capture the variable explicitly.
- **Import cycles**: Break with local imports or restructure. If A imports B and B imports A, factor shared types into a third module.
- **Bare except**: Never `except:` or `except Exception:` without re-raising or logging. Catch specific exceptions.
- **String formatting**: Use f-strings, not `%` or `.format()`. For logging, use `logger.info("msg %s", val)` (lazy formatting).

## Testing

- pytest is the standard. Use `conftest.py` for shared fixtures scoped to directories.
- `@pytest.fixture` for setup/teardown. Prefer factory fixtures over complex parametrized ones.
- `@pytest.mark.parametrize` for data-driven tests — keep the test body clean, data in the decorator.
- Use `tmp_path` fixture for filesystem tests, `monkeypatch` for environment/attribute patching.
- Structure: `tests/` mirrors `src/`. `tests/unit/` for pure logic, `tests/integration/` for I/O.
- Aim for `pytest --tb=short -q` to pass clean. Use `pytest-cov` for coverage.

## Project Structure

- **src layout** (preferred): `src/mypackage/` with `__init__.py`, installed via `pip install -e .`.
- **Flat layout**: `mypackage/` at repo root — simpler but risks import confusion.
- `__init__.py`: Keep minimal. Re-export public API only. No logic.
- Entry points: Define in `pyproject.toml` under `[project.scripts]`, not with `if __name__ == "__main__"` hacks.

## Async Patterns

- Use `asyncio` with `async def` / `await`. Never call sync I/O inside an async function.
- Use `asyncio.gather()` for concurrent tasks, `asyncio.TaskGroup` (3.11+) for structured concurrency.
- For HTTP: `httpx.AsyncClient` or `aiohttp.ClientSession` — never `requests` in async code.
- Run async CLI entry points with `asyncio.run(main())` at the top level.

## Safety Rules

1. **Type-annotate all public APIs** — every function signature must have typed parameters and a return type. Use `-> None` explicitly.
2. **`@dataclass(frozen=True)` for value objects** — frozen dataclasses enforce immutability at runtime; use `NamedTuple` for lightweight read-only tuples.
3. **No mutable default arguments** — never `def f(items=[])`. Use `None` as the default and assign inside: `if items is None: items = []`.
4. **Catch specific exceptions** — never bare `except:` or `except Exception:` without re-raising or structured logging. Catch the narrowest exception type.
5. **Validate at entry points** — parse and validate external input (env vars, CLI args, API responses) with Pydantic or dataclass schemas at system boundaries.
6. **Secrets from environment variables** — use `os.environ["KEY"]` (raises `KeyError` if absent) rather than `os.getenv("KEY")` with a `None` default that propagates silently.
7. **`ruff check` + `mypy --strict`** — run both in CI; `# type: ignore` only with an explicit error code (`# type: ignore[assignment]`).
8. **Virtualenv discipline** — always activate `.venv` before running commands; document the exact activation step in CLAUDE.md.
9. **f-strings for interpolation** — use f-strings for string building; use lazy `%`-style formatting only in logging calls (`logger.info("msg %s", val)`).
10. **`bandit -r src/`** — run bandit in CI for static security analysis; address all medium/high findings before merge.

## Anti-patterns

- Bare `except:` that silently swallows exceptions.
- Mutable default arguments (`def f(data={})`) — produces shared state across calls.
- `import *` from modules — pollutes the namespace and hides dependencies.
- `assert` for input validation in production code — assertions can be disabled with `-O`.
- Late-binding closures in loops without explicit capture (`lambda i=i: ...`).
- `os.getenv("KEY")` returning `None` silently — use `os.environ["KEY"]` for required vars.
- Missing `__all__` in public packages — makes the exported surface implicit and untested.
