---
name: ts-security-rules
user-invocable: false
description: 'Use when implementing TypeScript security controls — validation, secrets, no eval, parameterized queries.'
tools: []
paths: ['**/*.ts', '**/*.tsx']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: typescript
---

> **Invoke via `Skill({skill: "anvil:ts-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# TypeScript Security Practices

**Announce:** I'm using the ts-security-rules skill to inject TypeScript security guidance for this edit.

## Status

Ready to apply.

## Rules

- **Validate every external boundary with Zod or similar** — parse and validate HTTP requests, file loads, environment variables, and inter-process messages before use; schema validation at entry points prevents invalid data from propagating.
- **Never use `eval`, `Function(…)`, or string interpolation on untrusted input** — these execute arbitrary code; any user-controlled string is untrusted.
- **Escape HTML before DOM insertion** — use a library like `xss` or `sanitize-html` when inserting user-provided strings into HTML; never use `innerHTML` with untrusted input.
- **No secrets in source code** — load API keys, tokens, and passwords from environment variables only; use a secrets manager in production; never commit `.env` files.
- **Parameterize all database queries** — use parameterized queries, prepared statements, or ORM query builders; never concatenate user input into SQL strings.
- **Set explicit timeouts on network calls** — all outgoing HTTP requests must have `timeout` set (default to 30s); infinite waits can hang processes and waste resources.

## Why

Validation at boundaries is the first line of defense against injection attacks, malformed data, and unexpected code paths. Avoiding `eval` and string-based code generation eliminates arbitrary code execution vulnerabilities. HTML escaping prevents DOM-based XSS attacks. Parameterized queries prevent SQL injection. Timeouts prevent resource exhaustion from hung requests. Environment-based secrets prevent accidental exposure in logs, diffs, and backups.

## Done — status: DONE
