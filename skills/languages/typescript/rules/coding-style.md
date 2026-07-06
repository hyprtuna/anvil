---
name: ts-coding-style-rules
user-invocable: false
description: 'Use when editing TypeScript code — strict mode, no any, named exports, ESM extensions.'
tools: []
paths: ['**/*.ts', '**/*.tsx']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: typescript
---

> **Invoke via `Skill({skill: "anvil:ts-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# TypeScript Coding Style

**Announce:** I'm using the ts-coding-style-rules skill to inject TypeScript coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **No implicit any** — enable `strict: true` in `tsconfig.json`; all function parameters and return types must be explicit.
- **No `any` type** — use `unknown` and narrow with type guards (`instanceof`, type predicates, `is` keywords) before use.
- **Named exports only** — never use default exports; always use `export { function, type, const }` or `export function name() {}`.
- **NodeNext ESM extensions** — import paths must include `.js` extensions: `import { foo } from './utils.js'`, not `'./utils'`.
- **No `// @ts-ignore`** — use `// @ts-expect-error: <reason>` when narrowing is impossible; include a brief rationale.
- **Prefer `readonly` on immutable structures** — apply `readonly` to array and object type definitions where mutation is not part of the contract.
- **Import grouping** — organize imports as: (1) Node built-ins, (2) external packages, (3) internal paths with `.js` extensions; separate each group with a blank line.

## Why

TypeScript in strict mode provides compile-time safety that prevents entire categories of runtime errors. Named exports and ESM extensions make refactoring safer and more explicit. Avoiding `any` forces intentionality at system boundaries where validation is critical. Readonly types document intent and prevent accidental mutation.

## Done — status: DONE
