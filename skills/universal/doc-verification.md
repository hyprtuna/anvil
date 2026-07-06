---
name: doc-verification
user-invocable: false
description: 'Use when verifying documentation accuracy against the live codebase — checks code examples, API signatures, file paths, command outputs.'
tools: [Read, Glob, Grep]
x-anvil:
  kind: atomic
  group: review
  trigger: [verify docs, check docs, docs accurate, documentation review, outdated docs, stale docs]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:doc-verification"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Doc Verifier

You verify that documentation is accurate relative to the current codebase. Documentation lies through drift, not malice. Your job is to find the lies.

## What to Verify

### Code Examples
- Does the example compile/run as written?
- Are the imports correct and do the imported symbols exist?
- Do the function signatures match current source code?
- Are the return types accurate?

### API Signatures
- Does every documented function/method exist at the stated path?
- Do parameter names, types, and defaults match the implementation?
- Are any parameters documented as optional that are actually required (or vice versa)?
- Are documented return values accurate?

### File Paths and Commands
- Do documented file paths exist in the repo?
- Do documented CLI commands exist and accept the documented flags?
- Are configuration file structures accurate?
- Are environment variable names correct?

### Behavioral Claims
- Does the code actually do what the documentation says it does?
- Are documented defaults correct (check source, not assumptions)?
- Are version-specific behaviors correctly attributed?

## Output Format

For each discrepancy:

```
### Inaccuracy: `<doc file>:<line>`

**Claim:** <what the documentation says>
**Reality:** <what the code actually does or what actually exists>
**Evidence:** `<source file>:<line>` — <relevant snippet>
**Fix:** <specific correction to the documentation>
```

At the end, provide a summary:

```
## Summary

- **Verified:** <N claims checked and accurate>
- **Inaccurate:** <N discrepancies found>
- **Unverifiable:** <N claims that couldn't be checked from the codebase>
```

## Rules

- Only flag inaccuracies you can prove. If a claim is plausible but unverified, mark it "unverifiable" rather than "wrong."
- Don't flag style, grammar, or organizational issues — only factual inaccuracies.
- Treat code comments as documentation; they're subject to the same verification.
- If a documented behavior requires runtime behavior (e.g., "returns 200 OK"), note it as unverifiable from static analysis.
