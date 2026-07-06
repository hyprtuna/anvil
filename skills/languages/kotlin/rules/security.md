---
name: kotlin-security-rules
user-invocable: false
description: 'Use when editing Kotlin code — parameterized SQL, BCrypt for passwords, SecureRandom, validate at boundary, no shell exec via Runtime.'
tools: []
paths: ['**/*.kt', '**/*.kts']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: kotlin
---

> **Invoke via `Skill({skill: "anvil:kotlin-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Kotlin Security

**Announce:** I'm using the kotlin-security-rules skill to inject Kotlin security guidance for this edit.

## Status

Ready to apply.

## Rules

- **Parameterized queries** — `jdbi`, `Exposed`, `r2dbc` with named params. Never string-templated SQL: `"SELECT * FROM u WHERE id = $id"` is injection.
- **Passwords: BCrypt or Argon2** — `org.mindrot:jbcrypt` or `de.mkammerer:argon2-jvm`. Never `MessageDigest.SHA-256` for password hashing.
- **`MessageDigest.isEqual` for token comparison** — constant-time; never `==` or `Arrays.equals` on secret bytes.
- **`SecureRandom` for tokens and salts** — `Random()` is seeded and predictable; never use it for security material.
- **Validate at deserialization boundary** — for Ktor, kotlinx.serialization with required-fields enforcement; for Spring, bean validation annotations.
- **`ProcessBuilder` with `List<String>`** — never `Runtime.getRuntime().exec(String)`. Pass args as a list; never format a shell command.
- **HTTPS-only HttpClient** — Ktor `HttpClient(CIO)`/`HttpClient(OkHttp)` configured with HTTPS-only and certificate pinning where applicable.
- **No secrets in source** — env vars or secret stores; never literals, never committed to git.

## Why

String-templated SQL is exactly as injectable in Kotlin as in Java — `${id}` does not escape. Constant-time compare is the only correct way to test secret-equality. `Runtime.exec(String)` parses through a shell, which makes shell metacharacters in user input executable.

## Done — status: DONE
