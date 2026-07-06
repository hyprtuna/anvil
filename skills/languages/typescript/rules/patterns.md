---
name: ts-patterns-rules
user-invocable: false
description: 'Use when implementing TypeScript patterns — pure functions, immutability, async, discriminated unions.'
tools: []
paths: ['**/*.ts', '**/*.tsx']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: typescript
---

> **Invoke via `Skill({skill: "anvil:ts-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# TypeScript Idiomatic Patterns

**Announce:** I'm using the ts-patterns-rules skill to inject TypeScript pattern guidance for this edit.

## Status

Ready to apply.

## Rules

- **Pure functions over class methods** — when state is incidental, prefer standalone functions that take explicit parameters and return new values; avoid methods that rely on `this`.
- **Immutable data by default** — use `as const` for literal values, `readonly` arrays and tuples in type definitions, and spread/copy constructors for updates instead of mutation.
- **Result types for fallible operations** — return discriminated unions (`{ ok: true; value: T } | { ok: false; error: string }`) or `Result<T, E>` instead of throwing exceptions for expected failures.
- **async/await only** — never use raw `.then()` chains; use `try/catch` with `await` for all asynchronous code.
- **Use `satisfies` for shape validation** — when you want to check that a value matches a shape but preserve its narrow type, use `satisfies` instead of type assertions.
- **Discriminated unions over flag bags** — prefer `{ kind: 'pending' } | { kind: 'success'; data: T } | { kind: 'error'; message: string }` over `{ status: string; data?: T; error?: string }`.

## Why

Pure functions are easier to test, reason about, and parallelize. Immutable-by-default code prevents entire categories of bugs from shared-state mutation. Result types make error paths explicit and force callers to acknowledge failure cases. Discriminated unions prevent invalid state combinations and provide exhaustiveness checking. The `satisfies` operator preserves type narrowing while enforcing structural contracts.

## Done — status: DONE
