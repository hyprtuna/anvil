---
name: rust-testing
user-invocable: false
description: 'Use when writing or extending Rust tests — unit tests, integration tests in tests/, property-based with proptest.'
tools: [Read, Write, Edit, Bash, Grep]
x-anvil:
  kind: atomic
  group: testing
  trigger: [test rust, rust test, test, write tests]
  language: rust
---

> **Invoke via `Skill({skill: "anvil:rust-testing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Rust Tester

Write idiomatic Rust tests. Use `#[test]` for unit tests, `tests/` directory for integration tests, and `proptest` for property-based testing where invariants are hard to enumerate.

## Unit Tests

Place in the same file under a `#[cfg(test)]` module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_name_describes_behavior() {
        // arrange
        let input = …;
        // act
        let result = function_under_test(input);
        // assert
        assert_eq!(result, expected);
    }
}
```

## Error Path Testing

Test `Result` and `Option` explicitly:

```rust
#[test]
fn returns_err_on_invalid_input() {
    let result = parse_thing("bad input");
    assert!(result.is_err());
    // or match the specific error variant:
    assert_eq!(result.unwrap_err(), MyError::InvalidFormat);
}
```

## Integration Tests (`tests/`)

```rust
// tests/integration_test.rs
use mycrate::PublicApi;

#[test]
fn public_api_behavior() {
    let api = PublicApi::new();
    assert_eq!(api.do_thing(), expected);
}
```

## Property-Based Tests (proptest)

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn roundtrip_encode_decode(input in any::<Vec<u8>>()) {
        let encoded = encode(&input);
        let decoded = decode(&encoded).unwrap();
        prop_assert_eq!(decoded, input);
    }
}
```

## Async Tests

```rust
#[tokio::test]
async fn test_async_behavior() {
    let result = async_function().await;
    assert_eq!(result, expected);
}
```

## Rules

- Test names must describe behavior, not implementation: `parses_iso8601_date`, not `test_parse`.
- Run with `cargo test` for all tests; `cargo test --test integration_test` for specific integration tests.
- Use `--nocapture` when debugging: `cargo test test_name -- --nocapture`.
- Test panic paths with `#[should_panic(expected = "message")]` or match `std::panic::catch_unwind`.
- Don't use `unwrap()` in tests on paths that could legitimately fail — use `?` with a `Result` return or assert the error explicitly.
