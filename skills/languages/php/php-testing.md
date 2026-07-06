---
name: php-testing
user-invocable: false
description: 'Use when writing or extending PHP tests — PHPUnit or Pest, AAA pattern.'
tools: [Read, Write, Edit, Bash, Grep]
x-anvil:
  kind: atomic
  group: testing
  trigger: [test php, phpunit, pest, test]
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-testing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Tester

PHPUnit if `phpunit.xml` present; Pest if `pestphp/pest` in deps. AAA pattern.
