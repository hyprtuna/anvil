---
name: php-security-rules
user-invocable: false
description: 'Use when editing PHP code — PDO prepared statements, password_hash with default algorithm, hash_equals for tokens, htmlspecialchars on output, no shell_exec on user input.'
tools: []
paths: ['**/*.php']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Security

**Announce:** I'm using the php-security-rules skill to inject PHP security guidance for this edit.

## Status

Ready to apply.

## Rules

- **PDO with prepared statements** — `$pdo->prepare("SELECT * FROM u WHERE id = ?")->execute([$id])`. Never `mysql_query` (gone in 7+); never string-concatenated SQL.
- **`password_hash($pw, PASSWORD_DEFAULT)`** — opaque, version-agnostic, automatically Bcrypt or Argon2id when the engine ships it. Never `md5`/`sha1`/`crypt` for passwords.
- **`password_verify($input, $hash)`** — constant-time compare against the stored hash; never `==` on hash strings.
- **`hash_equals($a, $b)` for token compares** — constant-time string compare; never `==`.
- **`htmlspecialchars($s, ENT_QUOTES, 'UTF-8')` on every untrusted output** — defense against XSS; never trust caller pre-escaping.
- **`random_bytes` / `random_int` for cryptographic randomness** — never `mt_rand` or `rand` for tokens, IDs, or salts.
- **Avoid `shell_exec`/`exec` on user input** — when unavoidable, use `escapeshellarg` per argument; never format command strings.
- **`unserialize` only on trusted data** — PHP deserialization is a known gadget-chain vector; prefer `json_decode` with strict typing.

## Why

`password_hash` with `PASSWORD_DEFAULT` lets PHP upgrade the algorithm under you without breaking existing hashes. `hash_equals` prevents timing attacks on session tokens and MACs. `htmlspecialchars` is the canonical anti-XSS escape; framework templating engines apply it automatically — manual concatenation does not.

## Done — status: DONE
