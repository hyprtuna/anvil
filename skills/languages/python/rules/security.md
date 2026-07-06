---
name: python-security-rules
user-invocable: false
description: 'Use when editing Python code — no eval/exec, parameterized SQL, input validation, safe subprocess.'
tools: []
paths: ['**/*.py']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: python
---

> **Invoke via `Skill({skill: "anvil:python-security-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Python Security

**Announce:** I'm using the python-security-rules skill to inject Python security guidance for this edit.

## Status

Ready to apply.

## Rules

- **Never eval() or exec() on untrusted input** — these are injection vectors; use safer alternatives like `ast.literal_eval()` for simple data.
- **Parameterized SQL via ORM or DB-API** — use SQLAlchemy, Django ORM, or DB-API with `?` placeholders; never f-string SQL queries.
- **Validate input at boundaries** — parse and validate external input (env vars, CLI args, API bodies) with Pydantic or dataclass validators.
- **Secrets via environment variables and secrets manager** — use `os.environ["KEY"]` (raises KeyError if missing) or a secrets manager; never hardcode or check in.
- **subprocess with shell=False and arg list** — always use `subprocess.run([prog, arg1, arg2], shell=False)`; never pass user input to `shell=True`.
- **Explicit timeouts on requests/httpx** — set `timeout=` on all `requests.get()` and `httpx` calls to prevent indefinite hangs.
- **secrets.compare_digest() for secret equality** — use for comparing tokens, hashes, or secrets to prevent timing attacks.

## Why

Eval and exec are injection vectors. Parameterized queries prevent SQL injection. Input validation stops malformed data at the boundary. Environment-based secrets keep credentials out of source control. subprocess isolation and timeouts prevent command injection and denial-of-service. compare_digest prevents timing attacks on secrets.

## Done — status: DONE
