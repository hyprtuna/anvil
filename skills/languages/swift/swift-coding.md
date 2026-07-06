---
name: swift-coding
user-invocable: false
description: 'Use when implementing or modifying Swift code — SwiftUI, async/await, protocol-oriented, Swift Package Manager.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [swift, swiftui, ios, macos, xcode]
  language: swift
---

> **Invoke via `Skill({skill: "anvil:swift-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Swift Developer

Modern Swift 5.9+. Protocol-oriented over class inheritance. Structured concurrency with async/await. SwiftUI for UI. Swift Package Manager for dependencies.

## Language Conventions

- Use `let` by default; `var` only when mutation is required.
- Prefer value types (`struct`, `enum`) over reference types (`class`) unless identity semantics are needed.
- Use `guard` for early exits — keep the happy path unindented.
- Leverage `if let` / `guard let` shorthand (SE-0345): `if let value { }` instead of `if let value = value { }`.
- Use `some` and `any` keywords explicitly for existential and opaque types.
- Prefer trailing closure syntax. Use labeled arguments for multi-closure APIs.
- Follow Swift API Design Guidelines: clarity at the point of use, fluent naming.

## Protocol-Oriented Design

- Define behavior with protocols, not base classes. Favor composition over inheritance.
- Use protocol extensions for default implementations — not subclass overrides.
- Constrain generic types with `where` clauses for precise API contracts.
- Use `@retroactive` conformance sparingly and document why it exists.
- Prefer associated types in protocols over generic parameters when the type is determined by the conforming type.

## Async / Await and Structured Concurrency

- Use `async`/`await` for all asynchronous work. No completion handler callbacks in new code.
- Use `Task { }` for launching concurrent work from synchronous contexts.
- Use `TaskGroup` and `ThrowingTaskGroup` for structured fan-out parallelism.
- Mark shared mutable state with `actor` — never use locks or `DispatchQueue` for new code.
- Use `@Sendable` closures and `Sendable` conformance to satisfy strict concurrency checking.
- Enable `StrictConcurrency` in `Package.swift` or build settings: `-strict-concurrency=complete`.
- Use `AsyncSequence` and `AsyncStream` for event-driven or streaming data.

## Swift Package Manager

- Define dependencies in `Package.swift` with exact or range-based version constraints.
- Prefer `.upToNextMinor(from:)` for stability; `.upToNextMajor(from:)` when tracking active development.
- Organize code into targets: one library target per module, one test target per library.
- Use `Package.swift` plugins for code generation (SwiftGen, SwiftProtobuf).
- Pin dependencies with `Package.resolved` checked into version control.

## SwiftUI and Property Wrappers

- Use `@Observable` (Observation framework, iOS 17+) over `ObservableObject` for new code.
- `@State` for view-local mutable state. `@Binding` for child-to-parent state sharing.
- `@Environment` for dependency injection of shared services and system values.
- Keep views small and composable. Extract subviews at ~40 lines.
- Use `ViewModifier` for reusable styling. Use `PreferenceKey` for child-to-parent data flow.
- Preview every view with `#Preview { }` macro.

## Error Handling

- Use `do`-`catch` for recoverable errors. Let unrecoverable errors crash (`fatalError` in debug only).
- Define domain errors as `enum MyError: Error` with associated values for context.
- Use typed throws (SE-0413, Swift 6): `func load() throws(NetworkError)` when the error set is closed.
- Use `Result<Success, Failure>` for APIs that need to store or pass errors as values.
- Never force-unwrap (`!`) unless the invariant is documented and enforced by construction.

## Testing

- Use Swift Testing framework (`import Testing`, `@Test`, `#expect`) for new test targets.
- Fall back to XCTest only for UI tests or when Swift Testing is unavailable.
- Name tests descriptively: `@Test("User login succeeds with valid credentials")`.
- Use `#expect(throws:)` for error-path testing.
- Test async code with `await` directly — Swift Testing supports async test functions natively.
- Use protocol-based dependency injection for testability. No singletons in production code.

## Architecture

- MVVM for SwiftUI: `View` observes `ViewModel` (an `@Observable` class), which calls domain `Service` types.
- Keep business logic in plain Swift types, not in views or view models.
- Use `Environment` for injecting services into the view hierarchy.
- Organize by feature, not by layer: `Features/Login/LoginView.swift`, `Features/Login/LoginViewModel.swift`.
- Use `swift-format` or SwiftLint with a shared `.swift-format` / `.swiftlint.yml` configuration.
