# plan-verifier — Anvil SDD Gate Addendum

> This addendum is loaded when the user selects **"SDD spec-driven"** at the
> user-choice prompt. It activates Gate 1 (decision coverage) and Gate 2
> (open-questions resolution) that guard Anvil's spec-driven development process.
> Without this addendum the agent runs in generic plan-vs-goal mode with no
> spec requirements.

## When This Addendum Applies

The user chose the **SDD spec-driven** option. The following gates are now
active and run BEFORE the Goal-Backward Analysis. Each emits a `BLOCKER` gap
in the `PlanAuditReport` if it fails. Gate failures do NOT skip the rest of
verification — continue to the goal-backward steps and report everything.

## Locating the Spec File

Before running Gate 1 or Gate 2, locate the associated spec.md:

1. Check the plan's frontmatter `related_spec:` field — if present, use that path.
2. Check for a sibling `spec.md` next to the plan file (e.g., `${ANVIL_FEATURES_DIR}/<slug>/spec.md`).
3. Search `${ANVIL_SPECS_DIR}/` for any markdown file containing a `<decisions>` block.

If the spec.md cannot be found, do NOT silently continue. Report cleanly:

```
spec.md not found — cannot run SDD Gate 1 or Gate 2. Provide the spec path
via the plan's `related_spec:` frontmatter field or switch to Generic mode.
```

Emit this as a gap:

```json
{
  "kind": "missing-requirement",
  "severity": "critical",
  "message": "spec.md not found: cannot run Gate 1 (decision coverage) or Gate 2 (open questions). Add related_spec: frontmatter to the plan or switch to Generic mode.",
  "spec_ref": "spec.md"
}
```

## Gate 1: Decision Coverage (enforced when `workflow.decision_coverage=true`)

When the input plan has a feature slug and an associated spec.md:

1. Parse spec.md's `<decisions>` block. Extract every `D-NN:` ID via regex `/D-\d{2,}:/gm`.
2. Parse plan.md's frontmatter `covered_decisions:` list (or `must_haves.covered_decisions:`).
3. Compute: `missing = specIds − coveredIds`.
4. If `missing` is non-empty: emit a gap:
   ```json
   {
     "kind": "missing-requirement",
     "severity": "critical",
     "message": "Decision coverage gap: spec decisions not covered in plan.md covered_decisions: D-02, D-03",
     "spec_ref": "spec.md#decisions"
   }
   ```
5. A plan that does not cover all spec decisions **FAILS** this gate.

## Gate 2: Research Gate (enforced when `workflow.research_gate=true`)

When the input plan has a feature slug and an associated spec.md:

1. Parse spec.md's `## Open Questions` section.
2. Collect all bullet items that are NOT `- (none)` and NOT empty.
3. If any unresolved items exist: emit a gap for **each** item:
   ```json
   {
     "kind": "missing-requirement",
     "severity": "critical",
     "message": "Open question unresolved: 'What about performance implications?'",
     "spec_ref": "spec.md#open-questions"
   }
   ```
4. If the `## Open Questions` section is **absent entirely**, emit:
   ```json
   {
     "kind": "missing-requirement",
     "severity": "critical",
     "message": "spec.md is missing the required ## Open Questions section",
     "spec_ref": "spec.md"
   }
   ```
5. A plan with non-empty Open Questions **FAILS** this gate.

## Anvil SDD Example Output (after Gate checks)

Example PlanAuditReport JSON from a passing Anvil SDD plan:

```json
{
  "verdict": "pass",
  "plan_path": ".anvil/plans/v0.16.0.plan.md",
  "spec_path": ".anvil/specs/features/my-feature/spec.md",
  "gaps": [],
  "requirements_total": 8,
  "requirements_covered": 8
}
```

Example with a Gate 1 failure (decision not covered):

```json
{
  "verdict": "fail",
  "plan_path": ".anvil/plans/v0.16.0.plan.md",
  "spec_path": ".anvil/specs/features/my-feature/spec.md",
  "gaps": [
    {
      "kind": "missing-requirement",
      "severity": "critical",
      "message": "Decision coverage gap: spec decisions not covered in plan.md covered_decisions: D-03, D-05",
      "spec_ref": "spec.md#decisions"
    }
  ],
  "requirements_total": 8,
  "requirements_covered": 6
}
```
