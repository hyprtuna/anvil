---
name: java-coding-style-rules
user-invocable: false
description: 'Use when editing Java code — Java 21 LTS, records over POJOs, sealed types where exhaustive, no checked exceptions in new APIs.'
tools: []
paths: ['**/*.java']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: java
---

> **Invoke via `Skill({skill: "anvil:java-coding-style-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Java Coding Style

**Announce:** I'm using the java-coding-style-rules skill to inject Java coding style guidance for this edit.

## Status

Ready to apply.

## Rules

- **Java 21 LTS** — assume `record`, `sealed`, pattern matching for `switch`, text blocks; reject pre-Java-17 idioms.
- **Records for value types** — replace POJO classes with `record Name(...)` when the type is immutable data; no Lombok needed.
- **Sealed interfaces for closed hierarchies** — `sealed interface Result permits Ok, Err {}`; pattern matching becomes exhaustive.
- **No checked exceptions in new APIs** — use unchecked (`RuntimeException` subclasses) or `Optional<T>` / `Result`-style returns; checked exceptions break composability.
- **`var` for local types where the right side is obvious** — `var users = userService.list();`. Reject `var` when the type is meaningful and not obvious from context.
- **`final` on parameters and locals** — declare intent that the binding does not change.
- **Camel case** — `methodName`, `ClassName`, `CONSTANT_NAME`; package names lowercase.
- **One public class per file** — file name matches the class.

## Why

Records eliminate boilerplate that obscures intent. Sealed interfaces make `switch` exhaustive at compile time. Checked exceptions force callers to either propagate or wrap, which fights composability — Java's standard library has been moving away from them for years. `var` reduces type-noise where redundant; over-using `var` hides intent.

## Done — status: DONE
