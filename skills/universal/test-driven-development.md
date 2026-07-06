---
name: test-driven-development
description: 'Use when implementing under red->green->refactor discipline — writes the failing test first, always.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: development
  trigger: [tdd, test first, write a test, red-green]
  language: universal
  composition: {chains: [{after: planning}, {before: code-reviewer}]}
---

> **Invoke via `Skill({skill: "anvil:test-driven-development"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
test-driven-development starting — red-green-refactor cycle; writing failing test before any production code

# TDD Worker

Strict test-driven development. Every line of production code exists because a test demanded it.

---

## The Iron Law

<HARD-GATE>
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

If you are writing code that is not making a failing test pass, you are doing
it wrong. Stop. Write the test. Watch it fail. Then write the code.

No exceptions.
- Not for "simple" code.
- Not for "obvious" code.
- Not for "just a quick change."
- Not because "the test would be trivial."

A failing test is mandatory proof that the feature was missing. Without it,
you have no evidence the code you're writing is needed.
</HARD-GATE>

---

## The RED-GREEN-REFACTOR Cycle

Every feature, every fix, every change follows this cycle. In order. No skipping.

---

### RED Phase: Write a Failing Test

Write ONE test that describes the behavior you want. Just one.

**What makes a good test:**
- Tests ONE thing. If you need "and" to describe it, split it.
- Has a clear, descriptive name that reads like a specification.
  - Good: `rejects_empty_email_with_validation_error`
  - Bad: `test_email`, `it_works`, `test1`
- Tests real code, not mocks. Mocks are for boundaries (network, disk, time), not for the code under test.
- Follows Arrange-Act-Assert: set up state, perform action, check result.
- Is independent — does not depend on other tests running first.

**What makes a bad test:**
- Vague or generic name.
- Tests the mock instead of the code (your mock returns X, you assert X — congratulations, you tested nothing).
- Tests multiple behaviors in one test.
- Requires complex setup that obscures what is being tested.
- Tests implementation details instead of behavior (testing that a private method was called, instead of testing the observable result).

**Write the simplest test that fails for the right reason.**

Do not write multiple tests at once. One test. One cycle.

---

### VERIFY RED (Mandatory)

Run the test. Watch it fail. Read the failure message.

**This step is not optional.** You must confirm three things:

1. **The test fails** (not errors). A test that throws an unexpected exception is not "red" — it is broken. Fix the test.
2. **The failure is expected.** The failure message should describe the missing behavior. If the message is confusing, your test is poorly written.
3. **It fails because the feature is missing,** not because of a typo, import error, or setup problem.

**If the test passes immediately:** Your test is wrong. It is not testing what you think it is testing. Delete it. Think carefully about what behavior you are actually trying to verify. Write a new test.

A test that passes without any production code change is a test that tests nothing.

---

### GREEN Phase: Make It Pass

Write the SIMPLEST code that makes the test pass. Nothing more.

**Rules for the GREEN phase:**

- Satisfy the test. That is your only goal.
- YAGNI (You Ain't Gonna Need It). Do not add features the test does not require.
- Do not refactor. Do not improve. Do not optimize.
- Do not add error handling "while you're at it."
- Do not extract functions or classes "for cleanliness."
- Do not add logging, comments, or documentation.
- Hardcoding a return value is acceptable if it satisfies the test. The next test will force you to generalize.

**It is supposed to feel uncomfortable.** The GREEN phase produces ugly, minimal code. That is correct. Refactoring comes next.

If you find yourself writing more code than the test demands, stop. You are either:
- Writing code for a test that does not exist yet (write the test first), or
- Gold-plating (stop it).

---

### VERIFY GREEN (Mandatory)

Run the test. Watch it pass. Then run ALL tests.

**This step is not optional.** You must confirm two things:

1. **The new test passes.**
2. **All existing tests still pass.** If other tests broke, your change has side effects. Fix them NOW, before continuing. Do not proceed with broken tests.

If you cannot make the new test pass without breaking existing tests, that is important information. It may mean your design needs to change. Do not hack around it.

---

### REFACTOR Phase: Clean Up

Only AFTER green. Never refactor on red. Never.

**What to do in REFACTOR:**
- Remove duplication (especially between production code and test code).
- Improve names — variables, functions, classes, test descriptions.
- Extract helpers, utilities, or shared setup.
- Simplify complex conditionals.
- Apply design patterns where they emerge naturally (do not force them).

**Rules for REFACTOR:**
- Run tests after EVERY refactoring step. Stay green.
- If a refactoring breaks a test, undo it immediately. Refactor differently.
- Do not add new behavior during refactoring. If you need new behavior, start a new RED phase.
- Small steps. Rename one thing, run tests. Extract one function, run tests. Do not batch refactorings.

---

### COMMIT: Lock In Your Progress

**Commit after every GREEN phase.** Not after every refactor, not at the end of the day — after every green.

- Each commit is a safe point you can return to.
- Commit messages should describe the behavior added: "feat: reject empty email with validation error"
- If you realize you need to change direction, you can revert to the last green commit with confidence.

---

## Next Cycle

Pick the next behavior. Write the next failing test. Repeat.

The order of tests matters. Start with the simplest, most degenerate cases:
1. Empty input, null, zero.
2. Single valid input (the "happy path" base case).
3. Multiple valid inputs.
4. Edge cases and boundary conditions.
5. Error cases and invalid input.

Each test should force you to write a small amount of new code. If a test requires a large change, break it into smaller tests.

---

## Red Flags — Stop If You Catch Yourself:

| Red Flag | What It Really Means |
|---|---|
| Writing code before the test | You are guessing at requirements |
| Writing the test after the implementation | You are writing a rubber-stamp, not a specification |
| Test passes immediately on first run | Your test does not test anything |
| "I'll add tests later" | You will not. And the code will be harder to test. |
| "This is too simple to test" | Simple code has simple tests. Write them. |
| "I need to refactor before I can test" | Refactor under existing tests, then write the new test |
| "I'll just write a few tests at once" | You are batching, not doing TDD |
| Mocking everything | You are testing your mocks, not your code |

---

## Rationalization Table

| The Excuse | The Reality |
|---|---|
| "I know what the code should look like" | Then the test will be trivial to write. Write it. |
| "Writing tests slows me down" | Debugging without tests slows you down more. You just don't track that time. |
| "This is just a prototype" | Prototypes become production code. The test stays. |
| "The test would be trivial" | Trivial tests catch trivial bugs. Those are the ones that ship to production. |
| "I need to explore the design first" | Write a spike (throwaway code). Then start over with TDD. Do not retrofit tests onto a spike. |
| "Tests are for QA" | Tests are a design tool. They force you to think about interfaces before implementations. |
| "I'll refactor to make it testable later" | Code written without tests is hard to test by construction. Write the test first and the code is testable by definition. |
| "This is just a config change" | Config changes break production too. Test the behavior the config controls. |

---

## Debugging Integration

When a bug is found:

1. **Do not fix the bug yet.**
2. Write a failing test that reproduces the bug exactly.
3. Verify the test fails (VERIFY RED).
4. Fix the bug — the simplest change that makes the test pass.
5. Verify all tests pass (VERIFY GREEN).
6. Refactor if needed.
7. Commit.

The failing test is your proof that the bug existed and that your fix addresses it.
It stays in the suite permanently. The bug can never silently return.

This is where TDD and debugging meet. A bug without a test is a bug that will come back.

---

## Testing Anti-Patterns

Patterns that look like TDD but undermine it. Recognize them. Fix them.

---

### 1. Ice Cream Cone

**What it looks like:** Hundreds of slow E2E tests, a handful of integration tests, almost no unit tests. The test pyramid inverted.

**Why it's bad:** E2E tests are slow, brittle, and give vague failure messages. A 20-minute suite is a suite people skip. When they fail, you don't know which unit broke.

**How to fix it:** Invert the pyramid back. Most behavior belongs in fast, precise unit tests.

| Layer | Count | Speed | What it verifies |
|---|---|---|---|
| Unit | Many | Milliseconds | Individual function/class behavior |
| Integration | Some | Seconds | Component boundaries, adapters, I/O |
| E2E | Few | Minutes | Critical user journeys only |

---

### 2. Mock Everything

**What it looks like:** Every dependency is a mock. The function under test calls nothing real. The test asserts that mocks were called with specific arguments.

**Why it's bad:** You are testing your mock configuration, not your code. If the real dependency changes behavior, the test still passes. The test has zero predictive value.

**How to fix it:** Only mock at true system boundaries — network calls, filesystem writes, time, randomness, external services. Use real implementations for everything else. If wiring up the real thing is painful, your design has a coupling problem. Fix the design.

---

### 3. Test the Implementation, Not the Behavior

**What it looks like:** Tests reach into private methods, assert on internal state, or verify that specific internal function calls happened.

**Why it's bad:** Tests are now coupled to implementation details. Every internal refactor breaks the tests even when behavior is unchanged. You can't improve code under test without rewriting the tests that are supposedly testing it.

**Bad — testing an implementation detail:**
```typescript
// Asserts internal cache was populated — coupled to how, not what
expect(service['_cache'].has(userId)).toBe(true)
```

**Good — testing observable behavior:**
```typescript
// Asserts what the caller can observe — decoupled from internals
const result = await service.getUser(userId)
expect(result.id).toBe(userId)
// Second call should return same data (cache is an implementation detail)
const result2 = await service.getUser(userId)
expect(result2.id).toBe(userId)
```

---

### 4. The Liar Test

**What it looks like:** A test that always passes regardless of the code it is supposed to test.

**Why it's bad:** False confidence. The test is in the suite, the coverage number goes up, but no behavior is verified.

**Common causes:**
- Asserting on the mock's own return value (`mock.returns(42)` → `expect(result).toBe(42)` — you just verified the mock works)
- Missing assertions — the test runs without `expect()` calls and vitest/jest marks it green
- Swallowing errors with try/catch and forgetting to re-throw or assert on the catch

**How to fix it:** Always run the test in RED first. A test you cannot make fail by deleting the production code is a liar. Delete it or rewrite it.

---

### 5. Flaky Tests (Accepted)

**What it looks like:** A test fails intermittently — once every few runs, usually on CI. The team marks it as "known flaky" and ignores it.

**Why it's bad:** A flaky test is a test that sometimes lies. Once a flaky test is accepted, the suite loses credibility. Developers stop trusting red builds. Eventually no one investigates failures.

**How to fix it:** Fix or delete. Flakiness is always caused by hidden non-determinism: shared mutable state between tests, time dependencies, network calls, race conditions. Find the cause. Eliminate it. No flaky test is ever "fine."

---

### 6. Overly DRY Tests

**What it looks like:** A shared `buildUser()` helper with 12 optional parameters, a `setupMocks()` function that abstracts the entire test environment, deeply nested `describe` blocks sharing state through `beforeEach`.

**Why it's bad:** Tests should be readable in isolation. When a test fails, you should understand what it tests and why it failed in 10 seconds. Heavy abstraction turns debugging into archaeology.

**How to fix it:** Prefer duplication over abstraction in tests. Inline the setup. Repeat yourself. A 30-line test that is self-contained is better than a 10-line test that requires reading 5 helper functions to understand.

---

### 7. The Slow Suite

**What it looks like:** `npm test` takes 5 minutes. Developers run it once before pushing and get coffee.

**Why it's bad:** Slow feedback breaks the RED-GREEN-REFACTOR loop. The cycle should take seconds, not minutes. When the cycle is slow, developers batch changes and lose the discipline of one-test-at-a-time.

**How to fix it:** Unit tests should run in milliseconds. If a unit test is slow, it is hitting disk, network, or spawning processes — that is an integration test, move it. Run unit tests with `--watch` constantly. Run integration tests on commit. Run E2E tests on CI only.

---

## Workflow Summary

```
1. Pick the next behavior to implement.
2. Write ONE failing test.           [RED]
3. Run it. Confirm it fails.         [VERIFY RED]
4. Write minimal code to pass.       [GREEN]
5. Run all tests. Confirm green.     [VERIFY GREEN]
6. Clean up code. Tests stay green.  [REFACTOR]
7. Commit.                           [COMMIT]
8. Go to 1.
```

---

## TDD Checklist (Quick Reference)

- [ ] I wrote the test BEFORE the production code.
- [ ] The test has a clear, descriptive name.
- [ ] The test tests ONE behavior.
- [ ] I watched the test fail and read the failure message.
- [ ] The test fails because the feature is missing, not because of an error.
- [ ] I wrote the simplest code that makes the test pass.
- [ ] I did not add anything the test does not require.
- [ ] All tests pass, not just the new one.
- [ ] I refactored only after reaching green.
- [ ] Tests stayed green through every refactoring step.
- [ ] I committed at green.

## Done
test-driven-development done — red-green-refactor cycle complete; all tests pass at green; status: DONE
