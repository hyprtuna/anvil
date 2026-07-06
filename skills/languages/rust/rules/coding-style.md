---
name: rust-coding-style-rules
user-invocable: false
description: 'Use when editing Rust code — rustfmt-clean, snake_case, doc comments on public items, no unwrap in non-test code.'
tools: []
paths: ['**/*.rs']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: rust
---

> **Invoke via `Skill({skill: "anvil:rust-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Rust Coding Style

**Announce:** I'm using the rust-coding-style-rules skill to inject Rust coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **rustfmt on save** — `cargo fmt` produces canonical formatting; never hand-format.
- **snake_case for items, CamelCase for types** — functions, modules, locals are `snake_case`; structs, enums, traits are `CamelCase`; constants are `SCREAMING_SNAKE_CASE`.
- **Doc comments on every public item** — `///` triple-slash on every `pub fn`, `pub struct`, `pub enum`, `pub trait`. Module-level docs use `//!`.
- **No `unwrap()` / `expect()` outside tests** — return `Result<T, E>` and propagate via `?`. `expect()` is acceptable when the invariant is invariably true and the message names it.
- **No `unsafe` without justification** — every `unsafe` block carries a `// SAFETY:` comment explaining the invariant.
- **`use` grouping** — std imports first, external crates second, local `crate::` last; each group separated by blank line.
- **Prefer `&str` to `String` in function parameters** — accept `&str` (or generic `AsRef<str>`); return owned `String` when the caller needs to take ownership.

## Why

`cargo fmt` and `cargo clippy` mechanize style — disagreements about formatting waste reviewer attention. `unwrap` in production code converts recoverable errors into panics, which propagate badly across async tasks and FFI. Doc comments are the API surface the compiler enforces with `rustdoc`. `unsafe` without `// SAFETY:` is unreviewable.

## Done — status: DONE
