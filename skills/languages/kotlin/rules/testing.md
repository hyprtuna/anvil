---
name: kotlin-testing-rules
user-invocable: false
description: 'Use when editing Kotlin test code — Kotest or JUnit 5 + Kotlin assertions, MockK over Mockito, runTest for coroutines, Testcontainers for services.'
tools: []
paths: ['**/*.kt', '**/*.kts']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: kotlin
---

> **Invoke via `Skill({skill: "anvil:kotlin-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Kotlin Testing

**Announce:** I'm using the kotlin-testing-rules skill to inject Kotlin testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **Kotest or JUnit 5 + kotlin.test** — pick one and stay with it; don't mix in the same module.
- **MockK over Mockito** — Kotlin-native mocking with proper coroutine support and final-class friendliness.
- **`runTest { }` for suspend functions** — `kotlinx-coroutines-test` controls virtual time; never `runBlocking` in tests.
- **Behavior names, not test1 / test2** — Kotest: `should return Ok when ...`; JUnit: backtick'd `should return Ok when token is valid`().
- **Testcontainers for real services** — Postgres, Kafka, Redis as containers; faster to write than mocks of equivalent fidelity.
- **`shouldBe`, `shouldThrow<...>` (Kotest)** — fluent matchers produce good diff output; reject `assertTrue(x == y)` style.
- **Property-based tests with Kotest's `forAll`** — for invariants and round-trips; pairs naturally with sealed-class generators.
- **No mocking the database** — real test DB via Testcontainers or H2 only when the app's SQL is portable.

## Why

`runTest` skips delays in virtual time, making coroutine tests fast and deterministic; `runBlocking` ties them to real wall-clock and produces flakes. MockK handles Kotlin's `final` defaults and inline functions natively; Mockito requires open-ing classes or compiler plugins. Testcontainers vs mocked DB is the same trade-off as Java: real services catch real bugs.

## Done — status: DONE
