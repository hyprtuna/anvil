---
name: slop-removal
user-invocable: false
description: 'Use when removing AI-generated code smells — over-commenting, excessive abstraction, verbose patterns.'
tools: [Read, Edit, Grep, Glob]
x-anvil:
  kind: atomic
  group: review
  trigger: [clean code, remove slop, simplify, de-ai, ai slop]
  language: universal
  tags: [clean, simplify, slop, quality]
  aliases: [remove ai slop, clean up code, code cleanup]
---

> **Invoke via `Skill({skill: "anvil:slop-removal"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
slop-removal starting — identifying and removing AI-generated patterns that reduce clarity

# AI Slop Remover

Identify and remove AI-generated code patterns that reduce clarity, inflate line counts, or add unnecessary complexity.

## What Counts as AI Slop

### Comment Slop
- **Narration comments**: "This function is responsible for handling..." — the function name already says that
- **Filler comments**: "The following code...", "Below is...", "As you can see..."
- **Excessive JSDoc**: 10 lines of JSDoc on a 3-line function with a self-explanatory name
- **Restating the obvious**: `// increment counter` above `counter++`
- **Section dividers**: `// ========== SECTION ==========` with no real organizational value

### Code Pattern Slop
- **Premature abstraction**: Helper functions called exactly once, with more lines than the inlined version
- **Excessive error handling**: Try-catch on operations that cannot fail in context
- **Unnecessary validation**: Validating types at runtime that TypeScript already guarantees
- **Verbose variable names**: `userAuthenticationTokenValidationResult` when `isValid` suffices
- **Over-configuration**: Making hardcoded values configurable when there's exactly one caller
- **Empty interfaces/types**: `interface Options {}` with no fields and no planned extension
- **Re-export barrels**: `index.ts` files that just re-export from one file

### Structural Slop
- **Unnecessary layers**: Wrapper functions that add no value beyond indirection
- **God abstractions**: Classes/modules that try to be everything to everyone
- **Factory overkill**: `createFoo()` when `new Foo()` or a literal would suffice
- **Over-splitting**: One function per file when they're always used together

## The Process

1. **Identify**: Scan the target files for the patterns above
2. **Classify**: For each finding, determine if it's genuinely slop or has a valid purpose
3. **Remove**: Apply the simplification — delete comments, inline functions, simplify structures
4. **Verify**: Run tests after each change to ensure behavior is preserved
5. **Report**: List what was changed and why

## Decision Rules

| Pattern | Remove if... | Keep if... |
|---------|-------------|-----------|
| Comment | Restates the code | Explains WHY (not what) |
| Helper function | Called once, simpler inline | Called 2+ times or hides complexity |
| Error handling | Operation can't fail here | Operation can fail (I/O, user input) |
| Validation | Type system guarantees it | External boundary (API, file, CLI) |
| Abstraction | One caller, no planned reuse | Multiple callers or documented extension point |
| Verbose name | Context makes short name clear | Short name would be ambiguous |

## Output Format

```
## Slop Removal Report

### Removed
1. **[file:line]** — [what was removed]
   **Type:** comment slop / code pattern / structural
   **Why:** [specific reason it's slop]

### Kept (considered but valid)
1. **[file:line]** — [what was considered]
   **Why kept:** [specific reason it has value]

### Stats
- Lines removed: N
- Files modified: N
- Tests still passing: yes/no
```

## Rules

- Never remove code that changes behavior
- Always run tests after removal
- When in doubt, keep it — false negatives are better than breaking things
- Focus on recent changes unless instructed otherwise

## Done
slop-removal done — AI slop patterns removed; tests pass after cleanup; status: DONE
