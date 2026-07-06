---
name: rust-patterns-rules
user-invocable: false
description: 'Use when editing Rust code — Result<T,E> over panics, ownership before clones, iterators over indexed loops, ? for propagation.'
tools: []
paths: ['**/*.rs']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: rust
---

> **Invoke via `Skill({skill: "anvil:rust-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Rust Patterns

**Announce:** I'm using the rust-patterns-rules skill to inject Rust pattern guidance for this edit.

## Status

Ready to apply.

## Rules

- **`Result<T, E>` for fallible operations** — never panic to signal recoverable errors; reserve `panic!` for invariant violations.
- **`?` operator for propagation** — chain `result?` over manual `match` blocks when the only logic is forward-propagation.
- **Borrow before clone** — try `&T` first; clone only when ownership genuinely needs to split. `.clone()` in a hot path needs justification.
- **Iterators over indexed loops** — prefer `.iter().map().filter().collect()` over `for i in 0..vec.len()`. Compose; don't index.
- **`Option<T>` over sentinel values** — never use `-1` / null-equivalents to mean "absent."
- **Newtype for domain meaning** — wrap primitives that carry semantics (`UserId(u64)`, `Email(String)`) so the compiler enforces the distinction.
- **`From`/`Into` for conversions; `TryFrom`/`TryInto` for fallible ones** — implement these before reaching for ad-hoc helper functions.
- **Async: `tokio::spawn` for independent tasks; `.await` for sequential** — pick the runtime once at the binary boundary; library code stays runtime-agnostic when possible.

## Why

The compiler enforces exhaustive `Result`/`Option` handling at every match point — using sentinel values bypasses this safety. Newtypes make wrong-arg-order bugs unrepresentable. Iterators inline-fuse; indexed loops resist optimization and bounds-check elision. `?` keeps error-propagation paths visually short.

## Done — status: DONE
