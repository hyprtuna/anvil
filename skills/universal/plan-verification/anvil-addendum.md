# plan-verification — Anvil Addendum

> This addendum is loaded when the user picks **Structured JSON** or **Both** as the
> verification report format (Q2), regardless of which location was chosen in Q1.
> It extends the generic plan-verification body with the Anvil `ValidationMap` JSON
> schema, the retroactive-validator integration contract, and Anvil-specific
> plan path conventions.

## When This Addendum Applies

The user chose **Structured JSON** or **Both** as the format (Q2). This triggers:

1. If location is `.anvil/reviews/`: bootstrap with `mkdir -p .anvil/reviews/` (silent).
2. Emit a `ValidationMap` JSON object conforming to the schema below.
3. The retroactive-validator sub-task emits `ValidationMap` JSON as its primary output.

## ValidationMap JSON Schema

The verification report must validate against the `ValidationMap` schema from
`src/core/types.ts`:

```typescript
// src/core/types.ts → ValidationMap
ValidationMap = {
  plan_path: string,          // absolute path to the plan file
  generated_at: string,       // ISO 8601 datetime
  detected_runners: string[], // test runners found (e.g. ["vitest", "bun test"])
  entries: ValidationEntry[], // one entry per plan task
  uncovered_tasks: string[],  // task IDs with no associated tests
}

ValidationEntry = {
  task_id: string,            // non-empty (e.g. "T-01", "A1", "B2")
  title: string,              // task title from the plan
  coverage: 'covered' | 'partial' | 'uncovered',
  test_file?: string,         // path to the associated test file, if found
  test_command: string,       // non-empty proposed test command
}
```

## Example ValidationMap Output

```json
{
  "plan_path": "/home/user/project/.anvil/plans/v1.0.0.plan.md",
  "generated_at": "2026-05-16T10:30:00Z",
  "detected_runners": ["vitest"],
  "entries": [
    {
      "task_id": "T-01",
      "title": "Add auth module",
      "coverage": "covered",
      "test_file": "tests/unit/auth/auth.test.ts",
      "test_command": "bun test tests/unit/auth/auth.test.ts"
    },
    {
      "task_id": "T-02",
      "title": "Add session management",
      "coverage": "uncovered",
      "test_command": "bun test tests/unit/auth/session.test.ts"
    }
  ],
  "uncovered_tasks": ["T-02"]
}
```

## Plan Path Discovery (Anvil context)

When the dispatch envelope includes a plan file path, use it directly. Otherwise:
1. Check `${ANVIL_PLANS_DIR}/` for the most recently modified `*.plan.md`.
2. Fall back to `docs/plans/` for the most recently modified `*.md`.
3. Fail with NEEDS_CONTEXT if neither source yields a readable plan.

The retroactive-validator sub-task also accepts a git ref range to narrow diff history
(e.g., `v0.5.0..HEAD`) — pass this via the dispatch envelope when available.

## retroactive-validator Integration

The retroactive-validator sub-task (dispatched via `retroactive-validator-prompt.md`)
emits a `ValidationMap` JSON object. The plan-verification skill consumes this output
when the user picks **JSON** or **Both** format for plans that have already been executed.

Chain:
```
plan-verification → retroactive-validator sub-task → ValidationMap JSON output
```

The sub-task is read-only — it never modifies source files or test files.

## Bootstrap Behavior

If `.anvil/reviews/` does not exist when writing a JSON report there, create it silently:

```bash
mkdir -p .anvil/reviews/
```

No confirmation prompt. The user expressed intent by picking this location.
