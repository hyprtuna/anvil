---
name: php-patterns-rules
user-invocable: false
description: 'Use when editing PHP code — value objects over arrays, enums for closed sets, dependency injection via constructor, immutability where possible.'
tools: []
paths: ['**/*.php']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Patterns

**Announce:** I'm using the php-patterns-rules skill to inject PHP pattern guidance for this edit.

## Status

Ready to apply.

## Rules

- **Value objects over associative arrays** — wrap `['id' => 1, 'name' => 'x']` in a typed class with `readonly` properties. Arrays-as-records lose structure at every boundary.
- **Enums for closed sets** — PHP 8.1+ `enum Status: string { case Active = 'active'; ... }`. Never magic-string constants.
- **Constructor injection only** — DI via constructor; never service-locator or container-pull from inside a class.
- **Immutability by default** — `readonly` properties; `with*` methods that return cloned instances when state needs to change.
- **`match` over `switch`** — `match` is expression-form and strict-equality; `switch` is statement-form and loose-equality.
- **Null coalescing `??` and `??=`** — replace `isset($x) ? $x : 'default'` with `$x ?? 'default'`.
- **First-class callable `$this->method(...)`** — for callbacks; reject `[$this, 'method']` syntax.
- **Arrow functions `fn ($x) => $x * 2`** — for one-liners; closures (`function`) for multi-line or stateful captures.

## Why

Associative arrays in function signatures are unstructured by definition — every callsite has to know which keys are required. Value objects make the contract explicit. `match` is type-safe and exhaustive; `switch` silently coerces. Constructor injection makes dependencies impossible to overlook in tests; container-pulling makes them invisible.

## Done — status: DONE
