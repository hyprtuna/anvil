---
name: php-coding-style-rules
user-invocable: false
description: 'Use when editing PHP code — PSR-12 formatting, declare(strict_types=1), typed properties and returns, namespaces over global scope.'
tools: []
paths: ['**/*.php']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Coding Style

**Announce:** I'm using the php-coding-style-rules skill to inject PHP coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **PSR-12 formatting** — `php-cs-fixer` or `phpcs` with the `PSR12` ruleset; never hand-format.
- **`declare(strict_types=1);` at the top of every file** — opt into strict type coercion; runtime catches type mismatches early.
- **Typed properties, parameters, and returns** — `private int $count;`, `public function foo(string $s): User`. Mixed only when genuinely necessary.
- **Namespaces, not global functions** — every class lives under a `namespace App\Sub`; PSR-4 autoloading via Composer.
- **Constructor property promotion (PHP 8)** — `public function __construct(private readonly UserRepo $repo) {}`. Replaces the property + assignment boilerplate.
- **`readonly` for value types** — PHP 8.1+ `readonly` properties for DTOs and value objects.
- **camelCase methods, PascalCase classes, SCREAMING_SNAKE_CASE constants** — match the PSR-12 conventions.
- **No closing `?>` in pure-PHP files** — the closing tag invites whitespace bugs after it.

## Why

`strict_types=1` flips PHP from "I'll coerce silently" to "I'll fail loudly" — exactly what you want at type boundaries. Typed properties let the engine catch wrong-type assignment at runtime, before the bug propagates. Constructor property promotion eliminates 4 lines per dependency in the constructor.

## Done — status: DONE
