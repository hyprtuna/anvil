# two-stage-review — Anvil Addendum

> This addendum is loaded when the user picks **Structured JSON** or **Both** as the
> review report format (Q2), or when running inside an Anvil project.
> It extends the generic two-stage-review body with the Plan 30 JSON contract:
> `ReviewReport` schema, `review_type` semantics, severity grades, and
> `--strict-review` behavior.

## When This Addendum Applies

Load this addendum when:
- The user chose **Structured JSON** or **Both** as the report format (Q2).
- The executor is running inside an Anvil project and needs structured findings.

## Plan 30 JSON Contract

The Anvil two-stage review framework (originally shipped in Plan 30) uses a structured
JSON contract. All finding objects conform to `src/core/types.ts → ReviewReport`.

### review_type semantics

Stage 1 findings carry `"review_type": "spec-compliance"`.
Stage 2 findings carry `"review_type": "code-quality"`.

`review_type` is never a severity level — it identifies which review pass produced
the finding. Severity and `review_type` are independent axes.

### Severity grades

| Severity | When to use |
|---|---|
| `critical` | Data loss, security vulnerability, or correctness failure that will cause a prod incident. |
| `important` | Significant quality issue that will cause bugs or make the code hard to maintain. |
| `suggestion` | Improvement that is worth considering but does not block merging. |

### Finding JSON format

Each finding object (one per line after SPEC_FAIL or QUALITY_FAIL):

```json
{
  "review_type": "spec-compliance | code-quality",
  "severity": "critical | important | suggestion",
  "confidence": 0,
  "file": "path/to/file.ts",
  "line": 42,
  "category": "spec-gap | scope-creep | correctness | convention | bug | security | performance | architecture-violation",
  "message": "Description of the finding.",
  "fix": "Suggested remediation.",
  "spec_ref": "criterion text (spec-compliance only)"
}
```

### ReviewReport Schema

```typescript
// src/core/types.ts
ReviewFinding = {
  review_type: 'spec-compliance' | 'code-quality',
  severity: 'critical' | 'important' | 'suggestion',
  confidence: number,      // 0–100
  file: string,            // non-empty path
  line?: number,           // optional; 0-based nonneg int
  category: string,        // see category values above
  message: string,
  fix?: string,
  spec_ref?: string,
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

### Full Merged ReviewReport Example

```json
{
  "spec_compliance": {
    "passed": true,
    "findings": [],
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
        "message": "Missing null check on user lookup — users[user] may be undefined.",
        "fix": "Add null check: if (!users[user]) throw new Error('User not found')"
      }
    ],
    "skipped": false
  },
  "min_confidence": 80
}
```

## Anvil reviewer agents

In Anvil context, the two-stage cycle dispatches dedicated subagents instead of inline review:

- **Stage 1** → `agents/spec-reviewer.md` — read-only spec-compliance pass.
- **Stage 2** → `agents/code-quality-reviewer.md` — read-only code-quality pass.

Both emit `ReviewReport` JSON per the contract above (`review_type` distinguishes Stage 1 from Stage 2 findings).

## Stage 1 — Anvil JSON Output

When running in Anvil context, append to each SPEC_FAIL line one JSON finding object:

```
SPEC_FAIL: <bullet list>
{"review_type":"spec-compliance","severity":"critical|important|suggestion","confidence":0-100,"file":"path","line":N,"category":"spec-gap|scope-creep|correctness|convention|bug|security|performance|architecture-violation","message":"...","fix":"...","spec_ref":"criterion text"}
```

## Stage 2 — Anvil JSON Output

When running in Anvil context, append to each QUALITY_FAIL line one JSON finding object:

```
QUALITY_FAIL: <count> issue(s) found
{"review_type":"code-quality","severity":"critical|important|suggestion","confidence":0-100,"file":"path","line":N,"category":"bug|security|performance|correctness|architecture-violation|convention","message":"...","fix":"..."}
```

## Bootstrap Behavior

If `.anvil/reviews/` does not exist, create it silently:

```bash
mkdir -p .anvil/reviews/
```

## `--strict-review` (Plan 30 preserved behavior)

When the executor receives `--strict-review`, also dispatch `agents/strict-reviewer.md` after Stage 2.
The strict reviewer runs adversarial analysis and names tradeoffs. Its findings are advisory — they do
not block DONE unless the executor's caller treats them as blocking.
