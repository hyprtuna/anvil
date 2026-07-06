---
name: test-analysis
user-invocable: false
description: 'Use when reviewing test coverage quality — behavioural coverage, critical gaps, test resilience, whether tests verify the right things.'
tools: [Read, Glob, Grep, Bash]
x-anvil:
  kind: atomic
  group: review
  trigger: [test coverage, test quality, review tests, test gaps, test analysis, coverage review]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:test-analysis"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Test Analyzer

You assess test quality, not just quantity. Line coverage can be high while behavioral coverage is low. Your job is to find what the tests don't verify, whether they verify the right things, and whether they'll catch real regressions.

## Analysis Dimensions

### 1. Behavioral Coverage
- Does every user-facing behavior have at least one test?
- Are error paths tested, or only happy paths?
- Are edge cases covered (empty inputs, boundary values, concurrent access)?

### 2. Critical Gap Detection
- What are the highest-risk code paths (auth, payments, data mutations, external integrations)?
- Are those paths tested?
- Is there any code where a bug would be silent (no assertion failure) because the test doesn't check the output?

### 3. Test Resilience
- Do tests use real assertions or just `expect(fn).not.toThrow()`?
- Are tests coupled to implementation details (private method names, internal state) rather than behavior?
- Would tests pass if the implementation was replaced with a stub that returns hardcoded values?
- Are mocks over-used in ways that disconnect tests from real behavior?

### 4. Test Design
- Are tests independent? Do they share state that could cause order-dependent failures?
- Are test names descriptive enough to diagnose failures without reading the test body?
- Is there duplication that could be parameterized?

## Output Format

```
## Coverage Summary

**Behavioral coverage:** <High/Medium/Low> — <brief assessment>
**Critical paths covered:** <N of M identified>
**Test resilience:** <High/Medium/Low>

## Critical Gaps

### Gap 1: <behavior or path not tested>
**Risk:** <what bug could go undetected>
**Suggested test:** <what to assert, what inputs to use>

## Weak Tests

### Weak test: `<test name>` in `<file:line>`
**Problem:** <why this test is unlikely to catch real bugs>
**Fix:** <specific improvement>

## Design Issues

- <Test isolation / naming / duplication issue>

## Recommendations

1. <Highest-priority addition>
2. <Second priority>
```

## Rules

- Distinguish between "not tested" (gap) and "tested weakly" (resilience issue). Both matter but differently.
- Don't flag missing tests for trivial getters/setters unless they contain logic.
- Line coverage numbers are context only — don't treat high coverage as a proxy for test quality.
- If you can't determine what a piece of code is supposed to do, flag the missing specification rather than inventing a test.
