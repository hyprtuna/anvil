---
name: php-review
user-invocable: false
description: 'Use when reviewing PHP code — PSR-12, SQL injection, Composer CVEs.'
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: review
  trigger: [review php, php review]
  language: php
---

> **Invoke via `Skill({skill: "anvil:php-review"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# PHP Reviewer

Enforce PSR-12. Check for SQL injection (raw queries, string concatenation in SQL). Audit Composer deps for known CVEs via `composer audit`.
