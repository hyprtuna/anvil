---
name: java-security-rules
user-invocable: false
description: 'Use when editing Java code — PreparedStatement, BCrypt/Argon2 for passwords, MessageDigest.isEqual for tokens, validate at boundary, no Runtime.exec.'
tools: []
paths: ['**/*.java']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: java
---

> **Invoke via `Skill({skill: "anvil:java-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Java Security

**Announce:** I'm using the java-security-rules skill to inject Java security guidance for this edit.

## Status

Ready to apply.

## Rules

- **`PreparedStatement` always** — never `Statement.execute(String)` with concatenated user input. Bind parameters; let the driver escape.
- **Passwords: BCrypt or Argon2** — never `MessageDigest.SHA-256` for password storage. Use Spring Security's `PasswordEncoder` or `org.springframework.security.crypto.bcrypt`.
- **`MessageDigest.isEqual` for byte-array compares** — constant-time; prevents timing attacks on tokens/HMACs. Never `Arrays.equals` for secrets.
- **`SecureRandom` for cryptographic randomness** — never `Math.random()` or `new Random()` for tokens, IDs, or salts.
- **Validate at deserialization boundary** — bean validation (`@Valid`, `@NotNull`, `@Size`) on every controller input; never accept raw JSON into domain types.
- **Avoid `Runtime.exec(String)`** — use `ProcessBuilder` with `List<String>` args; never shell-format command strings.
- **No `XMLDecoder` / `ObjectInputStream` on untrusted data** — both deserialize to gadget chains; use JSON or a schema-validated format.
- **Secrets from env or vault** — never literals; never log secret values (mask with `***`).

## Why

`PreparedStatement` mechanizes SQL escaping; string concatenation is the canonical injection vector. `MessageDigest` for passwords is fast and rainbow-table-friendly — exactly wrong. `SecureRandom` is CSPRNG; `Random` is predictable. Java deserialization of attacker-controlled bytes is one of the most-exploited classes of vulnerability in the JVM ecosystem.

## Done — status: DONE
