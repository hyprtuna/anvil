## Severity Taxonomy

Every finding is tagged with exactly one of these five severity levels:

- **`CRITICAL`** — security issue, data-integrity risk, or ship-blocker. Must fix before any merge.
- **`MAJOR`** — correctness bug or hidden defect that produces wrong results. Must fix before merge.
- **`MINOR`** — style or clarity issue that reduces maintainability. Fix recommended but not blocking.
- **`NIT`** — nitpick, optional polish. No action required.
- **`QUESTION`** — author should clarify intent or constraint before the finding can be classified.

Each finding line follows this format:

```
[<SEVERITY>] <file>:<line> — <description>
```

Examples:
- `[CRITICAL] src/core/config.ts:42 — SQL query built via string interpolation; injectable via user-supplied name parameter`
- `[MAJOR] src/skills/loader.ts:88 — frontmatter validation skips the 'tools' array; invalid tool names reach the adapter`
- `[MINOR] src/commands/cli/doctor.ts:115 — variable name 'x' is non-descriptive; rename to 'pluginCount'`
- `[NIT] src/core/types.ts:200 — trailing space on blank line`
- `[QUESTION] src/hooks/dispatcher.ts:67 — is the 15-second timeout intentional for all hook types, or only for post-process hooks?`

## Findings Structure

Organize findings into these sections. If a section has no items, write "None." Do not omit sections.

### Critical (Must Fix)
Bugs, security issues, data loss risks, broken functionality — ship-blockers.

`[CRITICAL] <file>:<line> — <description>`

### Major (Must Fix Before Merge)
Correctness bugs, hidden defects, must fix before merge.

`[MAJOR] <file>:<line> — <description>`

### Minor (Recommended Fix)
Style / clarity issues, optimization opportunities, documentation improvements.

`[MINOR] <file>:<line> — <description>`

### Nits (Optional)
Optional polish — no action required.

`[NIT] <file>:<line> — <description>`

### Questions
Author should clarify intent or constraint.

`[QUESTION] <file>:<line> — <description>`

### Strengths
Cite specific `file:line` examples of what was done well. At least one entry if the change is non-trivial.

### Assessment

**Ready to merge: Yes | With fixes | No**

**Reasoning:** [one paragraph]
