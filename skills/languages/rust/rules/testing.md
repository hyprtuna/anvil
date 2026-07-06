---
name: rust-testing-rules
user-invocable: false
description: Use when editing Rust test code —
tools: []
paths: ['**/*.rs']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: rust
---

> **Invoke via `Skill({skill: "anvil:rust-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Rust Testing

**Announce:** I'm using the rust-testing-rules skill to inject Rust testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **Unit tests in `#[cfg(test)] mod tests`** — same file as the code under test; private items are testable directly.
- **Integration tests in `tests/`** — one file per integration scenario; each is a separate compilation unit, so it exercises the public API.
- **`assert_eq!`/`assert_ne!` over `assert!(a == b)`** — built-in macros print both sides on failure.
- **Property-based testing via `proptest`** — for invariants (round-trip, idempotence); generate inputs across the domain.
- **No mocking the database** — use a real test database (`testcontainers-rs`, in-memory SQLite, or the project's actual test fixture). Mocked DBs hide migration drift.
- **`#[should_panic(expected = "...")]`** — assert panic messages, not just that a panic occurred.
- **Test fixtures named `<thing>_test.rs`** — keep fixtures alongside the test that uses them, not in a global pile.
- **Run `cargo test --all-features`** — feature flags must each be exercised; CI matrix on relevant flag combinations.

## Why

Unit tests in the same file expose private items without an awkward `pub(crate)` escape hatch. Integration tests in `tests/` validate the public API exactly as a downstream user sees it. `proptest` finds edge cases hand-written tests miss. Mocked databases pass with broken migrations; real test DBs catch them.

## Done — status: DONE
