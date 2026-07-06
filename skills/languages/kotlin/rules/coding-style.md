---
name: kotlin-coding-style-rules
user-invocable: false
description: 'Use when editing Kotlin code — ktlint-clean, val over var, expression bodies, data classes for value types, no Java idioms in Kotlin files.'
tools: []
paths: ['**/*.kt', '**/*.kts']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: kotlin
---

> **Invoke via `Skill({skill: "anvil:kotlin-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Kotlin Coding Style

**Announce:** I'm using the kotlin-coding-style-rules skill to inject Kotlin coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **ktlint on save** — disagreements about formatting are mechanized; never hand-format.
- **`val` over `var`** — immutable bindings by default; mutable is the exception that needs justification.
- **Expression-body functions when one statement** — `fun double(x: Int) = x * 2`, not a block with `return`.
- **`data class` for value types** — built-in `equals`/`hashCode`/`toString`/`copy`; no manual implementations.
- **No semicolons** — multi-statement lines use newlines, not `;`.
- **Top-level functions, not utility classes** — Kotlin doesn't need `class Util { static ... }`; declare top-level `fun` in a file.
- **Trailing comma on multi-line argument lists** — keeps diffs single-line when adding params.
- **String templates over `+` concatenation** — `"hello $name"` or `"${expr}"`, never `"hello " + name`.

## Why

Most Kotlin style decisions are decidable by `ktlint`/`detekt` — code review attention belongs on logic, not formatting. `val` makes accidental mutation impossible. Data classes generate the boilerplate the JVM ecosystem has manually written for 20 years. Static utility classes are a Java workaround for the lack of top-level functions; Kotlin doesn't need them.

## Done — status: DONE
