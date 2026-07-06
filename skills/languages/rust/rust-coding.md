---
name: rust-coding
user-invocable: false
description: 'Use when implementing or modifying Rust code — ownership first, Result<T,E>, clippy, cargo fmt.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [rust, implement]
  language: rust
---

> **Invoke via `Skill({skill: "anvil:rust-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Rust Developer

Ownership first -- no unnecessary `clone()`. Prefer `Result<T, E>` over `panic!`. All code passes `clippy --all-targets -- -D warnings`. Run `cargo fmt` before every commit.

## Tool Detection

- `Cargo.toml` present -> Rust project managed by Cargo. Use `cargo build`, `cargo test`, `cargo run`.
- `Cargo.lock` checked in -> binary project (check it in); library -> gitignore it.
- `rust-toolchain.toml` -> pinned toolchain version. Respect it.
- Run `cargo clippy --all-targets -- -D warnings` for linting. Fix all warnings.
- Run `cargo fmt --check` to verify formatting; `cargo fmt` to apply.

## Ownership and Borrowing

- Pass by reference (`&T`, `&mut T`) by default. Only move or clone when necessary.
- Use `.clone()` sparingly and document why when you do. Excessive cloning is a code smell.
- Prefer `&str` over `String` in function parameters. Accept the borrowed form; let callers decide allocation.
- Use `Cow<'_, str>` when a function sometimes needs to allocate and sometimes doesn't.
- Lifetime elision handles most cases. Only annotate lifetimes when the compiler requires it.

## Error Handling

- Return `Result<T, E>` from all fallible functions. Use `?` operator for propagation.
- Libraries: define error types with `thiserror` (`#[derive(Error)]`) for typed, matchable errors.
- Applications: use `anyhow::Result` for ergonomic error handling with context (`.context("loading config")`).
- Never use `.unwrap()` or `.expect()` in production paths. Reserve for tests and provably-safe cases.
- Use `Option<T>` instead of sentinel values. Chain with `.map()`, `.and_then()`, `.unwrap_or_default()`.

## Common Pitfalls

- **Fighting the borrow checker**: If you're adding `Rc<RefCell<T>>` everywhere, refactor the data model instead. The borrow checker is telling you something.
- **String vs &str confusion**: Function parameters should take `&str` or `impl AsRef<str>`, not `String`. Build `String` only when you need ownership.
- **unwrap() in production**: Every `.unwrap()` is a potential panic. Use `.ok_or()`, `.context()`, or pattern match.
- **Lifetime elision misunderstanding**: Know the three elision rules. If a function has one reference input, the output lifetime matches it.
- **Dead code from over-generic APIs**: Don't make everything generic. Start concrete, generalize when you have two or three call sites.

## Traits and Generics

- `impl Trait` in argument position for simple cases: `fn process(reader: impl Read)`.
- `dyn Trait` for dynamic dispatch (trait objects): `Box<dyn Error>`, `&dyn Display`.
- Derive standard traits liberally: `#[derive(Debug, Clone, PartialEq, Eq, Hash)]`.
- Implement `Display` for user-facing output, `Debug` for development diagnostics.
- Use `From<T>` impls for type conversions; enables `?` operator across error types.

## Testing

- Unit tests live in `#[cfg(test)] mod tests { ... }` inside the source file.
- Integration tests go in `tests/` directory at the crate root — each file is a separate test binary.
- Use `#[test]` attribute. Assert with `assert!`, `assert_eq!`, `assert_ne!`.
- Use `#[should_panic(expected = "message")]` for tests that verify panic behavior.
- `proptest` or `quickcheck` for property-based testing on data-heavy logic.
- Use `cargo test -- --nocapture` to see println output during test development.

## Project Structure

- Binary crates: `src/main.rs` as entry point, split logic into `src/lib.rs` for testability.
- Library crates: `src/lib.rs` as the root, modules in `src/<module>.rs` or `src/<module>/mod.rs`.
- Workspaces: `Cargo.toml` at root with `[workspace] members = ["crates/*"]` for monorepos.
- Keep `main.rs` thin: parse args, configure logging, call into library code, handle the top-level `Result`.
- Use `mod.rs` sparingly — prefer `src/module_name.rs` with `src/module_name/` for submodules (2018 edition style).

## Async Rust

- Use `tokio` as the async runtime unless the project specifies otherwise.
- Mark async entry points with `#[tokio::main]` or `#[tokio::test]`.
- Prefer `tokio::spawn` for concurrent tasks. Use `tokio::select!` for racing futures.
- Avoid blocking the async runtime: use `tokio::task::spawn_blocking` for CPU-heavy or sync I/O work.

## Safety Rules

1. **`Result<T, E>` everywhere** — every fallible function returns `Result`. Use `?` for propagation. Never suppress errors with `unwrap()` in production paths.
2. **Borrow by default** — accept `&T` / `&mut T`; take ownership only when you need to store or consume. Accept `&str` over `String`, `&[T]` over `Vec<T>` in function params.
3. **Libraries use `thiserror`, applications use `anyhow`** — typed errors in library crates; ergonomic context chains with `.with_context(|| ...)` in binary crates.
4. **No gratuitous cloning** — every `.clone()` call should be justified. Excessive cloning signals a data-model problem, not a borrowing trick.
5. **Minimize `unsafe`** — every `unsafe` block must carry a `// SAFETY:` comment explaining the exact invariants that make it sound.
6. **Enum state machines make illegal states unrepresentable** — model states as sealed enums with data in variants; match exhaustively without a wildcard `_` on business-critical enums.
7. **Parse, don't validate** — convert unstructured input into typed structs at system boundaries using the newtype pattern; invalid data never enters business logic.
8. **`cargo fmt` + `cargo clippy -- -D warnings`** — run both before every commit; clippy warnings are errors.
9. **Secrets from environment variables** — use `std::env::var`; fail fast at startup if required vars are absent.
10. **Dependency hygiene** — run `cargo audit` to check for known CVEs; run `cargo deny check` for license compliance.

## Anti-patterns

- `unwrap()` / `expect()` outside tests or provably unreachable branches.
- `Rc<RefCell<T>>` as a first response to borrow-checker friction — refactor the data model instead.
- `String` parameters when `&str` suffices.
- `unsafe` blocks without a `// SAFETY:` explanation.
- Ignoring the `?` operator and matching `Err` inline throughout the callstack.
- `clone()` to satisfy the borrow checker without understanding why ownership is contested.
- Wildcard `_` arm on exhaustive enums — add the variant or handle it explicitly.
