---
name: tdd-iron-law
user-invocable: false
description: 'Use when writing implementation code for any non-trivial feature or bug fix — a failing test comes first, always. No exceptions, no just-this-onces.'
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  trigger: [implement, feature, fix, tdd, test, red-green-refactor]
  tags: [tdd, testing, rigor, rule, priority]
  aliases: [write the test first, red green refactor]
---

# tdd-iron-law

## The rule

<HARD-GATE phase="implementation">
Red before green, every time. Write the failing test. Run it. See it fail. Only then write the implementation. When the test passes, refactor with the test as the safety net.

letter = spirit: the intent of this gate is that a failing test catches a real behavioral gap *before* any implementation exists. A test that passes on first run, or that is added after the implementation, satisfies the letter (a test exists) but violates the spirit (the test never proved a gap). The test must have been red *because* the behavior did not yet exist.

This gate lifts ONLY when:
- A new test or test case appears in the diff for the new behavior.
- The test ran and failed (output captured before the implementation was written).
- The implementation was written *after* the failure was observed.
</HARD-GATE>

## When to use

- Adding any new behavior: feature, endpoint, component, calculation, rule.
- Fixing any bug that a regression test could catch (almost always).
- Refactoring code covered by tests — extend the test first, then refactor.

## Red flags (thoughts that mean STOP)

| Thought | Reality |
|---|---|
| "I'll add the test after" | After means never. Write it first. |
| "It's too small to need a test" | Small changes break quietly. Test it. |
| "The test will be trivial" | Trivial tests document intent. Write it. |
| "I'll refactor without a test" | Untested refactors are rewrites. Add the test. |
| "There's no way to test this" | Then you don't understand the contract yet. |
| "Just this once — I'll backfill in the next commit" | Just-this-once is the canonical rationalization. The next commit never lands. Write the test now. |

## Exit condition

For every new piece of behavior: a test that existed, failed, and now passes. The test file is in the diff. The test-run output is visible.

## Why

TDD is not slower. It's the same work in a different order — one where the scariest step (the test) is cheapest because there's no implementation debt yet. Teams that skip TDD pay the cost in incident reports, not time savings.
