# Plan 30 JSON Contract — Anvil-Flavored Review Output

> This addendum is loaded by the `code-review` skill when the user picks **JSON** or **Both**
> as the output format (Q2) — regardless of which location was chosen in Q1. It fully describes
> the structured JSON contract. The generic skill body must not reference this contract.

## Overview

When writing to `.anvil/reviews/<slug>.json`, the skill emits a `ReviewReport` JSON object
conforming to the schema defined in `src/core/types.ts → ReviewReport`. This is the **Plan 30
two-stage review contract**: every finding is tagged with both a `review_type` and a `severity`,
which are orthogonal.

## review_type semantics

- `"spec-compliance"` — the finding comes from the spec-compliance pass. The reviewer checked
  whether the change satisfies the acceptance criteria or plan tasks it was meant to implement.
- `"code-quality"` — the finding comes from the code-quality pass. The reviewer checked for
  production-quality issues: correctness, security, performance, architecture, or convention.

`review_type` is never a severity level. Severity and `review_type` are independent axes.

## Severity grades

| Severity | When to use |
|---|---|
| `critical` | Data loss, security vulnerability, or correctness failure that will cause a prod incident. |
| `important` | Significant quality issue that will cause bugs or make the code hard to maintain. |
| `suggestion` | Improvement that is worth considering but does not block merging. |

## JSON schema

The emitted object must validate against the `ReviewReport` Zod schema:

```typescript
// src/core/types.ts
ReviewFinding = {
  review_type: 'spec-compliance' | 'code-quality',
  severity: 'critical' | 'important' | 'suggestion',
  confidence: number,      // 0–100
  file: string,            // non-empty path
  line?: number,           // optional; 0-based nonneg int
  category: 'bug' | 'security' | 'performance' | 'correctness' |
            'architecture-violation' | 'convention' | 'spec-gap' | 'scope-creep',
  message: string,         // non-empty finding description
  fix?: string,            // optional remediation suggestion
  spec_ref?: string,       // optional reference to the spec section
}

ReviewPass = {
  passed: boolean,
  findings: ReviewFinding[],
  skipped: boolean,
}

ReviewReport = {
  spec_compliance: ReviewPass,
  code_quality: ReviewPass,
  min_confidence: number,  // default 80
}
```

## Example output

```json
{
  "spec_compliance": {
    "passed": true,
    "findings": [
      {
        "review_type": "spec-compliance",
        "severity": "critical",
        "confidence": 95,
        "file": "src/auth.ts",
        "line": 42,
        "category": "security",
        "message": "SQL query built via string interpolation; injectable via user-supplied parameter.",
        "fix": "Use parameterized query: db.query('SELECT * FROM users WHERE name = ?', [name])"
      }
    ],
    "skipped": false
  },
  "code_quality": {
    "passed": false,
    "findings": [
      {
        "review_type": "code-quality",
        "severity": "important",
        "confidence": 88,
        "file": "src/auth.ts",
        "line": 10,
        "category": "bug",
        "message": "Missing null check on user lookup — users[user] may be undefined."
      }
    ],
    "skipped": false
  },
  "min_confidence": 80
}
```

## Bootstrap behavior

If `.anvil/reviews/` does not exist, create it silently before writing:

```bash
mkdir -p .anvil/reviews/
```

No confirmation prompt. The user expressed intent by picking this location.

## Slug derivation

The `<slug>` segment in `.anvil/reviews/<slug>.json` is derived from the review target:

- PR review → `pr-<number>` (e.g. `pr-123`)
- Branch review → `<branch-name>` with slashes replaced by `-`
- Commit review → `sha-<short-sha>` (e.g. `sha-a1b2c3d`)
- File/glob review → `<basename>-review` (e.g. `auth-review`)

When the slug is ambiguous, use the most human-readable identifier available.
