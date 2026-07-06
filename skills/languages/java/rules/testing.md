---
name: java-testing-rules
user-invocable: false
description: 'Use when editing Java test code — JUnit 5, AssertJ for fluent assertions, Mockito for collaborators, Testcontainers for real services.'
tools: []
paths: ['**/*.java']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: java
---

> **Invoke via `Skill({skill: "anvil:java-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Java Testing

**Announce:** I'm using the java-testing-rules skill to inject Java testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **JUnit 5 (Jupiter)** — `@Test`, `@ParameterizedTest`, `@Nested`. Reject JUnit 4 idioms (`@RunWith`, `@Rule`).
- **AssertJ over Hamcrest or vanilla `assertEquals`** — `assertThat(x).isEqualTo(y)`, fluent and produces good diff output.
- **Mockito for collaborators, NOT databases** — mock interfaces at the seam; never mock the JDBC layer.
- **Testcontainers for real services** — Postgres, Kafka, Redis run as Docker containers in tests; faster than mocks at producing real-world failure modes.
- **`@Nested` for grouping related tests** — describe behavior, not implementation; one inner class per scenario family.
- **Arrange / Act / Assert sections marked with blank lines** — visual structure makes failures easier to read.
- **Test names describe behavior** — `shouldRejectExpiredTokens`, not `testToken1`. Use `@DisplayName` for human-readable variants.
- **No `Thread.sleep` in tests** — use Awaitility (`await().until(...)`) for async expectations; `Thread.sleep` is flaky and slow.

## Why

JUnit 5 has cleaner extension points and parameterization — JUnit 4 has been frozen for years. AssertJ produces failure messages that show what was expected vs received without manual stringification. Testcontainers replaces fragile mocks with real services for the cost of a Docker pull — the test catches actual driver/SQL/protocol bugs. `Thread.sleep` is the #1 source of CI flake.

## Done — status: DONE
