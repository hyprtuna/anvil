---
name: go-coding-style-rules
user-invocable: false
description: 'Use when editing Go code — gofmt on save, errors as values, small interfaces, document exports.'
tools: []
paths: ['**/*.go']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: go
---

> **Invoke via `Skill({skill: "anvil:go-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Go Coding Style

**Announce:** I'm using the go-coding-style-rules skill to inject Go coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **Run gofmt on save** — apply `gofmt` or editor auto-format before commit; ensures consistency across the codebase.
- **Handle errors as values** — every function that can fail must return `error` as the last return value; always check `if err != nil`.
- **Keep interfaces small** — prefer 1–3 method interfaces; small interfaces are easier to mock and satisfy.
- **No naked returns** — always name return values in the signature; never use bare `return` statements.
- **Lowercase package names matching directories** — package names must be lowercase and match their directory; `package myapp`, not `MyApp`.
- **Exported names use CamelCase** — start with uppercase for exported symbols; use CapitalCase, not CONSTANT_CASE.
- **Document every exported symbol** — begin the comment with the symbol name: `// Foo does X` (for functions), `// Foo is the Y type` (for types).

## Why

gofmt eliminates style bikeshedding. Error-as-values is idiomatic Go; explicit checking prevents silent failures. Small interfaces enable composition. Named returns improve readability and allow defer cleanup. Lowercase package names and documented exports make code discoverable and maintainable.

## Done — status: DONE
