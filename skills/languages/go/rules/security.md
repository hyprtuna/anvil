---
name: go-security-rules
user-invocable: false
description: 'Use when editing Go code — parameterized SQL, crypto/rand, constant-time compare, no shell exec.'
tools: []
paths: ['**/*.go']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: go
---

> **Invoke via `Skill({skill: "anvil:go-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Go Security

**Announce:** I'm using the go-security-rules skill to inject Go security guidance for this edit.

## Status

Ready to apply.

## Rules

- **database/sql with ? or $1 placeholders** — use parameterized queries only; never concatenate user input into SQL strings.
- **Validate input lengths and types before processing** — check string lengths, numeric ranges, and format before consuming external input.
- **crypto/rand for secrets and tokens** — use `crypto/rand` for generating secrets; never `math/rand` for security-sensitive values.
- **crypto/subtle.ConstantTimeCompare for secret equality** — use for comparing tokens, hashes, and secrets to prevent timing attacks.
- **Explicit timeouts on http.Client** — set `Timeout` on `http.Client` or `context.Context` with deadline to prevent indefinite hangs.
- **html/template for HTML output, never text/template** — use `html/template` which auto-escapes; `text/template` is unsafe for HTML.
- **Never shell-out with user input via exec.Command** — always use arg lists, never `shell=true`; validate or escape user input if shell is unavoidable.

## Why

Parameterized queries prevent SQL injection. Input validation stops malformed data at the boundary. crypto/rand is cryptographically sound. ConstantTimeCompare prevents timing attacks on secrets. Client timeouts prevent denial-of-service. html/template auto-escapes dangerous characters. Shell isolation prevents command injection.

## Done — status: DONE
