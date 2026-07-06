---
name: rust-security-rules
user-invocable: false
description: 'Use when editing Rust code — sqlx parameterized queries, ring/rustls for crypto, no shell injection via Command, secrets via env not literals.'
tools: []
paths: ['**/*.rs']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: rust
---

> **Invoke via `Skill({skill: "anvil:rust-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Rust Security

**Announce:** I'm using the rust-security-rules skill to inject Rust security guidance for this edit.

## Status

Ready to apply.

## Rules

- **Parameterized queries always** — `sqlx::query!`, `diesel::sql_query` with bound params. Never format SQL strings.
- **Crypto: `ring` or `rustls` only** — never roll your own primitives; never use `md5`, `sha1` for security purposes. `ring` for low-level, `rustls` for TLS.
- **Constant-time comparison for secrets** — `subtle::ConstantTimeEq`; never `==` on tokens/HMACs.
- **Random for security: `rand::thread_rng`** — never `rand::random` from a seeded RNG; for cryptographic randomness use `getrandom` directly.
- **`Command` with explicit args** — use `Command::new("bin").arg("--flag").arg(value)` form; never `Command::new("sh").arg("-c").arg(formatted_str)`.
- **Secrets from env or secret store** — never literal strings; never commit secrets. Use `dotenvy` for local dev only; production reads from runtime env.
- **`unsafe` blocks reviewed** — every `unsafe` carries `// SAFETY:` explaining the invariant; reviewer treats `unsafe` as a hard pause.
- **Validate at boundary** — deserialize external input through a validating type (`serde_with`, custom `Deserialize`), not directly into business types.

## Why

Format-string SQL is the canonical injection vector. Constant-time comparison prevents timing-side-channel auth-bypass. Shell-arg formatting is command injection by another name. `unsafe` without `// SAFETY:` ships UB. Validating at the type-deserialization boundary prevents malformed data from reaching invariant-protecting code paths.

## Done — status: DONE
