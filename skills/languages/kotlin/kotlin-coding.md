---
name: kotlin-coding
user-invocable: false
description: 'Use when implementing or modifying Kotlin code — data classes, sealed classes, coroutines.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [kotlin, implement]
  language: kotlin
---

> **Invoke via `Skill({skill: "anvil:kotlin-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Kotlin Developer

Data classes for DTOs. Sealed classes for closed variants. Extension functions for ergonomics. Coroutines for structured concurrency. Null safety is a language feature -- use it.

## Tool Detection

- `build.gradle.kts` present -> Gradle with Kotlin DSL (preferred). Use `./gradlew build`, `./gradlew test`.
- `build.gradle` (Groovy) -> Gradle project with Kotlin source sets.
- `pom.xml` with `kotlin-maven-plugin` -> Maven-based Kotlin project.
- Detekt (`.detekt.yml` or `detekt` Gradle plugin) -> static analysis. Run `./gradlew detekt`.
- ktlint (`ktlint` or `kotlinter` Gradle plugin) -> formatting. Run `./gradlew ktlintFormat`.

## Kotlin Idioms

- **Data classes**: Use for value types and DTOs. Gives `equals`, `hashCode`, `copy`, destructuring for free.
- **Sealed classes/interfaces**: `sealed interface Result<T>` with `data class Success<T>(val value: T) : Result<T>` for exhaustive `when` expressions.
- **Extension functions**: Add utility methods without inheritance. `fun String.toSlug(): String = ...`. Don't overuse for core logic.
- **Scope functions**: `let` for null-safe transforms, `apply` for builder-style init, `also` for side effects, `run` for scoped computation. Avoid nesting more than one deep.
- **Expression body**: `fun square(n: Int): Int = n * n` for single-expression functions.
- **`require` / `check`**: Use `require(x > 0)` for argument validation, `check(state == READY)` for state preconditions.

## Null Safety

- Kotlin's type system distinguishes `String` (non-null) from `String?` (nullable). Leverage this.
- Use safe calls: `user?.name?.uppercase()`. Chain with `?.let { }` for transforms.
- Elvis operator: `val name = user?.name ?: "Anonymous"` for defaults.
- **Never use `!!`** unless you can prove non-null at that point and want a clear crash on violation. Treat `!!` as a code smell.
- When interoperating with Java, add `@Nullable` / `@NonNull` annotations on the Java side to preserve Kotlin null safety.

## Common Pitfalls

- **Overusing scope functions**: Nested `let`/`run`/`apply` blocks become unreadable. If the chain is longer than 2 calls, extract a named function.
- **lateinit abuse**: `lateinit var` bypasses null safety. Use only for framework injection (e.g., `@Autowired`). Prefer constructor parameters or `lazy`.
- **Ignoring coroutine cancellation**: Always check `isActive` in long loops or use `ensureActive()`. Cancellation is cooperative.
- **Java interop nullability**: Platform types (`String!`) from Java code are neither null nor non-null. Always add explicit null checks at the boundary.
- **Data class copy pitfalls**: `copy()` is shallow. Nested mutable objects share references. Use immutable nested types.

## Coroutines and Concurrency

- Use structured concurrency: every coroutine must have a parent scope. Never use `GlobalScope`.
- `coroutineScope { }` for parallel decomposition. `supervisorScope { }` when child failures should not cancel siblings.
- `withContext(Dispatchers.IO)` for blocking I/O. `Dispatchers.Default` for CPU-bound work. Never block `Dispatchers.Main`.
- `Flow` for cold async streams. Use `.collect()` to consume, `.map()`, `.filter()` for transforms.
- Handle exceptions with `try/catch` inside coroutines, or `CoroutineExceptionHandler` for fire-and-forget (`launch`).
- Use `async { }` + `.await()` for concurrent computations that return results.

## Testing

- JUnit 5 with Kotlin: use backtick-quoted test names for readability: `` @Test fun `should return empty when user not found`() ``.
- MockK for Kotlin-native mocking: `every { repo.findById(any()) } returns User(...)`. Supports coroutines with `coEvery`.
- Kotest as an alternative: property-based testing, data-driven specs, rich assertion library.
- `assertSoftly { }` (Kotest or custom) to collect multiple assertion failures in one test run.
- Use `runTest { }` (from `kotlinx-coroutines-test`) for testing suspend functions with virtual time.
- Testcontainers for integration tests with real infrastructure.

## Project Structure

- Follow Maven/Gradle standard layout: `src/main/kotlin/`, `src/test/kotlin/`.
- Package naming matches Java conventions: `com.company.project.module`.
- Prefer single-file-per-class, but Kotlin allows multiple classes per file for tightly related types (sealed hierarchies, extension functions).
- Use `internal` visibility for module-private APIs — stronger than Java's package-private.
- Multi-module Gradle projects: root `settings.gradle.kts` with `include(":core", ":api", ":app")`.

## Safety Rules

1. **Never use `!!`** — treat `!!` as a compile-time code smell. Use `?.`, `?:`, `requireNotNull()`, or `checkNotNull()` instead.
2. **Sealed types with exhaustive `when`** — model closed hierarchies as `sealed interface` and match every branch; no `else` clause on sealed-type `when`.
3. **`val` over `var`** — default to `val`; only promote to `var` when mutation is explicitly required.
4. **Structured concurrency — never `GlobalScope`** — every coroutine must be launched from a scoped context (`viewModelScope`, `coroutineScope`, `supervisorScope`).
5. **`CancellationException` must be rethrown** — never swallow `CancellationException` in a `catch` block; cooperative cancellation depends on it propagating.
6. **Parameterized queries for Room/SQLDelight** — use `:input` bindings, never string interpolation inside `@Query`.
7. **Secrets in build config or secure storage** — use `BuildConfig` fields generated from CI secrets for release builds; use `EncryptedSharedPreferences` or Keychain for runtime storage.
8. **Scope function depth limit** — no more than two nested scope functions (`let`, `run`, `apply`, `also`); extract a named function instead.
9. **`lateinit var` only for framework injection** — use constructor parameters or `lazy {}` for everything else.
10. **`data class copy()` is shallow** — nested mutable objects share references after `copy()`; prefer immutable nested types.

## Anti-patterns

- `!!` as a quick null escape — diagnose the nullability source and fix it.
- `else` branch on a `when` over a sealed type — defeats exhaustiveness checking.
- `var` fields in `data class` — breaks structural equality and thread safety.
- Deep scope-function chains (3+ levels) — extract to named functions.
- `GlobalScope.launch` — unscoped coroutines leak and cannot be cancelled cleanly.
- Catching and swallowing `CancellationException`.
- `lateinit var` for non-framework dependencies — use `lazy {}` or constructor injection.
