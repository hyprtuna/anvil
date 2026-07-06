---
name: coding-standards
user-invocable: false
description: 'Use when applying cross-language coding standards — naming, readability, immutability, error handling, code-smell detection; language overlays extend this baseline.'
tools: []
x-anvil:
  kind: atomic
  group: rules
  trigger: []
  language: universal
---

# Coding Standards

Baseline coding conventions applicable across all languages and project types. This is the shared floor — language overlays add language-specific rules on top.

Reach for the language overlay first. Use this skill when:
- Starting a new project or module from scratch.
- Reviewing code for cross-cutting quality concerns.
- Enforcing naming, readability, or structural consistency across a polyglot codebase.
- Onboarding a contributor to general conventions before language-specific ones.

## 1. Readability First

- Code is read far more often than it is written. Optimize for the reader, not the author.
- Clear, descriptive names at every scope.
- Self-documenting code over comments; comments explain *why*, not *what*.
- Consistent formatting enforced by a tool, not by convention.

## 2. Naming

| Scope | Pattern |
|---|---|
| Variables / properties | Descriptive noun or noun phrase: `marketSearchQuery`, not `q` |
| Boolean variables | Read as a true/false statement: `isUserAuthenticated`, `hasPermission` |
| Functions / methods | Verb-noun pair: `fetchMarketData`, `calculateSimilarity`, `isValidEmail` |
| Constants | Screaming snake in languages that support it: `MAX_RETRIES`, `DEBOUNCE_DELAY_MS` |
| Files | Follow the project's established casing; never mix casing styles within a directory |

Avoid single-letter names outside loop counters and well-known mathematical conventions.

## 3. Immutability by Default

Prefer immutable data. Mutate only when there is a clear performance or ergonomic reason, and document it.

- Declare variables as constants / `val` / `const` / `final` wherever possible.
- Return new values from functions rather than mutating arguments.
- Use spread / copy constructors for updates rather than in-place mutation.

## 4. KISS, DRY, YAGNI

**KISS** — the simplest solution that correctly solves the problem. Avoid abstraction layers that do not pay for themselves today.

**DRY** — extract logic that appears in more than two places. Tolerate one duplication; remove the second.

**YAGNI** — do not build features before they are needed. Speculative generality adds maintenance surface with no immediate benefit.

## 5. Error Handling

- Every error must be handled or explicitly propagated. Silent swallowing is always a bug.
- Log enough context to diagnose the problem server-side (IDs, operation, error message).
- Return generic messages to external callers — never expose stack traces, SQL errors, or internal paths.
- Handle errors at the layer that has enough context to do something useful; propagate upward otherwise.

## 6. Function Size and Nesting

- Functions longer than 50 lines are candidates for extraction.
- Nesting deeper than 3 levels is a signal to extract a function or invert the condition (early return / guard clause).
- One function, one responsibility — if you need "and" in the description, split it.

## 7. Avoid Magic Numbers and Strings

Name every constant that has non-obvious meaning:

```
BAD:  if retryCount > 3: ...
GOOD: MAX_RETRIES = 3 / if retryCount > MAX_RETRIES: ...
```

## 8. Async / Concurrency

- Prefer structured concurrency primitives over raw threads or unscoped goroutines/coroutines.
- Run independent operations in parallel when they have no ordering dependency.
- Do not mix sync and async I/O in the same execution context.

## 9. Tests

- Tests are named to describe behavior, not implementation: `returns empty list when user not found`, not `testGetUser`.
- Arrange / Act / Assert structure. One logical assertion per test where practical.
- Tests are documentation — a passing test suite is the spec.

## 10. Comments

Write comments that explain *why* a choice was made, not *what* the code does:

```
BAD:  # Increment counter
GOOD: # Use exponential backoff to avoid overwhelming the API during outages
```

Outdated comments are worse than no comments — delete them.

## Code-Smell Checklist

Before marking any unit of work complete, verify:

- [ ] No magic numbers or unexplained string literals
- [ ] No commented-out code committed
- [ ] No `TODO` without a linked issue or a date
- [ ] No silent error swallowing
- [ ] No function longer than 50 lines without justification
- [ ] No nesting deeper than 3 levels without a guard-clause refactor
- [ ] No duplication introduced without a plan to remove it
