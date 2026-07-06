---
name: two-stage-review
user-invocable: false
description: Use when orchestrating spec-compliance review then code-quality review — any agent can call this instead of inlining both stages.
tools: [Read, Grep, Glob]
x-anvil:
  kind: atomic
  group: review
  trigger: [two-stage review, review this implementation]
  language: universal
  tags: [review, quality-gate, spec-compliance]
---

## Status
two-stage-review starting — dispatching spec-compliance reviewer then code-quality reviewer

# Two-Stage Review

**Announce:** Routing through two-stage review — Stage 1 spec compliance, then Stage 2 code quality.

This skill orchestrates a two-stage review framework: first spec compliance, then code quality.
Any executor agent can call this skill instead of inlining the two-pass review mandates.

## Prompt override (parse before asking)

Before presenting any question, scan the user's prompt for a location override:

```
regex: /store (this )?(at|in|to) (\S+)/i
```

If matched, use the captured path as the Q1 answer without asking Q1.

## Q1 — Location

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "Where should the review report be stored?",
  "intro": "Choose where to write the merged review report. Location and format are independent — you will be asked about format next.",
  "options": [
    {
      "label": ".anvil/reviews/<slug> (Recommended)",
      "description": "In-project reviews directory; created if missing. Integrates with Anvil reporting commands."
    },
    {
      "label": "docs/reviews/<slug>",
      "description": "In-project public-shaped docs; visible in rendered documentation."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/reviews/<slug>",
      "description": "Out-of-project; keeps your project repo clean. Only shown when ~/.anvil/ exists."
    },
    {
      "label": "Custom path",
      "description": "Relative path you provide. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Co-located with the project and accessible to reporting commands."
}
```

Note: only show the `~/.anvil/projects/` option when `~/.anvil/` exists on the system.

## Q2 — Format

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "What format should the review report use?",
  "intro": "Structured JSON integrates with tooling and CI pipelines. Markdown is human-readable and renders in PRs.",
  "options": [
    {
      "label": "Structured JSON (Recommended)",
      "description": "Machine-readable review report; consumable by tooling and CI. Load anvil-addendum for Anvil-specific schema."
    },
    {
      "label": "Markdown",
      "description": "Human-readable severity-graded review with section headers; renders in PR diffs and on GitHub."
    },
    {
      "label": "Both",
      "description": "Write both a JSON and a markdown report at the chosen location."
    }
  ],
  "_rationale": "Structured JSON enables automated aggregation and tooling integration."
}
```

## Load addendum if needed

When the user picks **Structured JSON** or **Both**, load
[`./two-stage-review-anvil-addendum.md`](./two-stage-review-anvil-addendum.md) for the
structured JSON schema, severity vocabulary, and the `--strict-review` behavior. The
markdown-only path uses the generic stage output below.

---

## Stage 1: Spec Compliance

Dispatch a **read-only** subagent. Grant it Read, Grep, Glob tools only —
no Edit, Write, or Bash.

### Invocation prompt template

```
Review the work produced for [TASK NAME] against the following acceptance criteria:

[paste the exact acceptance criteria from the plan]

Check:
1. Completeness — every required item is present (files, exports, tests, types)
2. No extras — no unrequested files, no scope creep, no features not in the spec
3. Correctness — implementations match the specified interfaces and behaviors

Output exactly one of:
- SPEC_PASS — criteria met, no issues
- SPEC_FAIL: <bullet list of specific missing / extra / incorrect items>
```

### Handling the Stage 1 result

- `SPEC_PASS` → proceed to Stage 2.
- `SPEC_FAIL` → send the specific failure list back to the implementer. Re-dispatch Stage 1. Loop until
  `SPEC_PASS` (maximum 3 loops before escalating to the user with the full failure report).

**Do not proceed to Stage 2 until Stage 1 passes.**

---

## Stage 2: Code Quality

Dispatch a second **read-only** subagent. Grant it Read, Grep, Glob tools only.

### Invocation prompt template

```
You are a senior code reviewer. Review [TASK NAME] for production quality.

Check the following dimensions:
1. Correctness — logic is sound, edge cases handled, no off-by-one errors
2. Architecture — layer boundaries respected, no circular imports, correct abstraction level
3. Security — no injection vectors, no credential leaks, no unsafe shell interpolation
4. Performance — no unnecessary I/O in hot paths, no unbounded loops over large inputs
5. Test quality — tests cover behavior not just lines; failure messages are meaningful; no test-the-mock patterns
6. Convention compliance — strict typing, named exports, async/await, proper import extensions, validation at boundaries

Only report findings with confidence >= 80%.

After all findings (or if none), output exactly one of:
- QUALITY_PASS — no critical findings
- QUALITY_FAIL: <count> issue(s) found — one or more critical findings present
```

### Handling the Stage 2 result

- `QUALITY_PASS` → task is ready to mark DONE.
- `QUALITY_FAIL` → send the specific findings back to the implementer. Re-dispatch Stage 2. Loop
  until `QUALITY_PASS` (maximum 3 loops before escalating).

**Do not mark the task DONE until both stages pass.**

---

## How to invoke from an executor prompt

In any executor agent body, replace the inline two-stage review prose with:

```
After the implementer returns DONE or DONE_WITH_CONCERNS, invoke the `two-stage-review` skill:
  - Pass: task name, acceptance criteria, and the list of changed files.
  - Block on any SPEC_FAIL or QUALITY_FAIL before marking the task DONE.
```

---

## Consuming the merged result

After both stages complete, merge the two pass objects into a single review report:

```
{
  "spec_compliance": { "passed": true/false, "findings": [...] },
  "code_quality":    { "passed": true/false, "findings": [...] }
}
```

A task is DONE only when both `passed` fields are `true`.

> **Anvil context:** For Anvil-specific JSON schema (`ReviewReport`, severity grades,
> `--strict-review` behavior), load `two-stage-review-anvil-addendum.md`.

---

## Done
two-stage-review done — both review stages complete; merged report produced; status: DONE
