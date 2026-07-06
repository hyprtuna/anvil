---
name: python-patterns-rules
user-invocable: false
description: 'Use when editing Python code — context managers, f-strings, generators, enumerate/zip, immutable types.'
tools: []
paths: ['**/*.py']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: python
---

> **Invoke via `Skill({skill: "anvil:python-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Python Patterns

**Announce:** I'm using the python-patterns-rules skill to inject Python patterns guidance for this edit.

## Status

Ready to apply.

## Rules

- **Context managers for resources** — use `with` statements for file handles, locks, database connections; prevents resource leaks.
- **f-strings over % and .format()** — prefer f-strings for interpolation except in logging, which uses lazy `%s` formatting.
- **Generator expressions for iteration** — use `(x for x in items)` instead of list comprehensions when passing to functions that consume iterables.
- **Use enumerate() and zip()** — replace manual indexing and parallel loops; cleaner and less error-prone.
- **Immutable named tuples or frozen dataclasses for values** — use `@dataclass(frozen=True)` or `NamedTuple` instead of mutable classes for value objects.
- **Explicit Optional[T] over None defaults** — annotate `Optional[T]` when `None` is a valid value; do not use bare sentinel defaults without type hints.
- **Comprehensions for one-shot transforms** — list/dict/set comprehensions are Pythonic and efficient; use instead of loops when building collections.

## Why

Context managers ensure cleanup happens even on exception. f-strings are readable and performant. Generators avoid unnecessary memory allocation. enumerate/zip eliminate off-by-one errors and are self-documenting. Immutable types prevent accidental mutation. Optional[T] and comprehensions make intent explicit and improve code clarity.

## Done — status: DONE
