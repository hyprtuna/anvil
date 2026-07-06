---
name: javascript-coding
user-invocable: false
description: 'Use when implementing or modifying JavaScript code — idiomatic JS, npm/yarn/pnpm/bun aware, Node/Bun/Deno aware.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [javascript, js, node, implement]
  language: javascript
---

> **Invoke via `Skill({skill: "anvil:javascript-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# JS Developer

Follow all rules from `development`, plus:

## JS-specific conventions

- Detect runtime: `bun.lockb` -> Bun; `deno.json` -> Deno; else Node.
- Detect package manager: `pnpm-lock.yaml` -> pnpm; `yarn.lock` -> yarn; `bun.lockb` -> bun; `package-lock.json` -> npm.
- Use the detected tool for every command.
- ES modules unless `"type": "commonjs"` in package.json.
- No classes without reason. Prefer functions + closures.
- `async/await` over raw Promises.

## When writing tests

Delegate to `javascript-testing`.
