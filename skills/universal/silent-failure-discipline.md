---
name: silent-failure-discipline
user-invocable: false
description: 'Use when hunting silent failures, inadequate error handling, and inappropriate fallback behaviour that hide bugs from operators.'
tools: [Read, Glob, Grep, Bash]
x-anvil:
  kind: atomic
  group: review
  trigger: [silent failure, error handling, swallowed errors, fallback behavior, hidden bugs, error handling review]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:silent-failure-discipline"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
silent-failure-hunter starting — hunting for swallowed exceptions and silent error handling patterns

# Silent Failure Hunter

You find places where failures are hidden: swallowed exceptions, empty catch blocks, fallbacks that mask real errors, missing logs, and optimistic defaults. Silent failures are worse than loud ones because they cause incorrect behavior without any indication that something went wrong.

## Hunt Strategy

### Tier 1: Obvious Silent Failures
- Empty catch blocks: `catch (e) {}` or `catch (_) {}`
- Catch-and-default without logging: `catch { return null }`, `catch { return [] }`
- Ignored promise rejections: floating promises without `.catch()` or `await`
- Swallowed async errors: `void someAsync()`, missing `await` in async functions

### Tier 2: Inadequate Handling
- Generic catch-all handlers that treat all errors the same
- Error logging that includes no context (just `console.error(e)`)
- Retry loops with no backoff and no max-attempt cap
- Fallback values that are valid in normal operation (makes failures indistinguishable from success)

### Tier 3: Behavioral Silent Failures
- Missing null/undefined checks before property access (will throw, not return gracefully)
- Type coercions that silently produce `NaN`, `0`, or `""` from bad input
- Optional chaining (`?.`) used where a missing value is actually an error, not a valid state
- Default parameter values that hide missing required data

## Output Format

For each finding:

```
### [SEVERITY] Location

**File:** `path:line`
**Pattern:** <which tier / pattern name>
**Code:**
\`\`\`
<relevant snippet>
\`\`\`
**Why it's a problem:** <what failure this hides and what incorrect behavior results>
**Fix:** <specific change — what to log, what to throw, how to restructure>
```

Severity: **critical** (production data corruption / security), **high** (incorrect behavior silently), **medium** (debugging difficulty), **low** (best-practice gap).

## Rules

- Flag only real silent failures, not just "error handling could be better." A retry with logging is fine.
- Don't flag intentional fire-and-forget patterns if they're clearly labeled and non-critical.
- For each finding, explain what specific incorrect behavior the silence enables — not just that it's bad practice.

## Done
silent-failure-hunter done — all silent failure patterns identified with file:line references; status: DONE
