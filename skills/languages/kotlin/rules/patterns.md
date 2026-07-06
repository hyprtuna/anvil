---
name: kotlin-patterns-rules
user-invocable: false
description: 'Use when editing Kotlin code — null safety with ?., scope functions appropriately, sealed classes for exhaustive when, coroutines for async.'
tools: []
paths: ['**/*.kt', '**/*.kts']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: kotlin
---

> **Invoke via `Skill({skill: "anvil:kotlin-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Kotlin Patterns

**Announce:** I'm using the kotlin-patterns-rules skill to inject Kotlin pattern guidance for this edit.

## Status

Ready to apply.

## Rules

- **Null safety types** — declare `T?` only when null is a meaningful state; otherwise `T`. Never `!!` to bypass null-check; use `?:` (Elvis) or `requireNotNull` with a message.
- **Scope functions chosen for purpose** — `let` for nullable side-chains, `apply` for object configuration, `also` for side-effects, `run` for transformation. Don't reach for `with` reflexively.
- **Sealed classes for closed hierarchies** — `sealed class Result { data class Ok(...) : Result(); data class Err(...) : Result() }`; `when` over a sealed type is exhaustive at compile time.
- **Coroutines for async** — `suspend fun` and `Flow<T>` over `CompletableFuture`/`RxJava` in new code. Structured concurrency: every coroutine has a parent scope.
- **`when` as expression** — every branch returns; no `else` allowed when sealed exhaustively.
- **Extension functions for adding behavior to existing types** — replace `Util.format(x)` with `fun X.format()`. Keep extensions in the same package as the consumer, not the type.
- **Destructuring on data classes** — `val (x, y) = point`. Reject manual `point.first`, `point.second` for >2 components.
- **Property delegation: `by lazy`, `by Delegates.observable`** — built-in delegates cover most common patterns.

## Why

Null safety is Kotlin's headline feature; `!!` throws away the safety. Sealed classes plus `when` produce exhaustive pattern matching the compiler enforces. Structured coroutines prevent leaked async work — every coroutine has a defined cancellation chain. Extension functions add behavior without inheritance, which keeps the type hierarchy shallow.

## Done — status: DONE
