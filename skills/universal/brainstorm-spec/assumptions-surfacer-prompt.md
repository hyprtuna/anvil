# Assumptions Surfacer — sub-task prompt

> **Dispatch pattern:** `Task(general-purpose)` with this prompt body. Read-only
> sub-task spawned by the `brainstorm-spec` skill between the initial spec draft
> and `plan-verification`. Not a named agent — collapsed from the prior
> `assumptions-surfacer` named agent per the prompt-template pattern.

## Status: assumptions-surfacer starting — scanning spec and codebase for hidden assumptions; producing A-NNN list

**Announce:** I am surfacing hidden assumptions in the spec before plan-writing begins.

## What this sub-task does

Read an approved spec at the path provided in the dispatch envelope (or discover it using the logic in §Path Discovery below), then scan the codebase for ground-truth signals — existing file layouts, exported type shapes, naming conventions, test patterns, config structures — and produce a numbered `A-NNN:` list of assumptions the spec is silently relying on without stating them as explicit decisions.

Each assumption entry includes a codebase citation (file:line or grep pattern) and a judgment on whether the assumption should be elevated to a `D-NN:` decision in `brainstorm-spec` before plan-writing proceeds.

This sub-task is read-only. It never edits or writes files.

## Position in chain

This sub-task sits between `brainstorm-spec` (which produces the spec + an initial `<decisions>` block) and `plan-verification` (which audits the resulting plan). The surfaced assumptions feed back to `brainstorm-spec`: any assumption marked "elevation: yes" must become a `D-NN:` decision before `plan-writing` runs.

```
brainstorm-spec → assumptions-surfacer → [D-NN elevations in brainstorm-spec] → plan-writing → plan-verification
```

## Path Discovery

If the dispatch envelope does not include a spec path, look for:
1. A `spec.md` file under the most recently modified subdirectory of `specs/features/` (relative to project root) — take the most recently modified one.
2. A `spec.md` in the current working directory.
3. Fail with NEEDS_CONTEXT if neither source yields a readable spec.


## Output format

Return a markdown block with the following structure:

```markdown
## Surfaced Assumptions

- A-001: <assumption statement> — evidence: <file:line or grep pattern> — elevation: yes|no — <one-line rationale for yes/no>
- A-002: ...
...

## Recommendation

<Short paragraph — is this spec "ready for plan-writing" or "should return to brainstorm-spec for D-NN elevation of [list assumptions]"?>
```

Rules for the assumption list:
- Number sequentially: `A-001`, `A-002`, etc.
- Every entry must cite at least one evidence location (a `file:line` reference or a quoted grep pattern that matches an existing codebase convention).
- Target 5–15 assumptions. Fewer than 5 suggests the spec has been over-specified already or this sub-task did not read deeply enough. More than 15 suggests the scan is too granular (implementation details, not real assumptions).
- State assumptions as affirmative propositions the spec relies on, e.g. "The config file is loaded from `.anvil/config.json` relative to the project root."

## Constraints

- Read-only. No `Edit`, no `Write`, no `Bash` execution.
- Evidence before assertion. Every assumption must be backed by a codebase citation before it is listed. Do not list speculative assumptions without evidence.
- Do not re-state decisions already present in the spec's `<decisions>` block. Those are already explicit.
- Do not list assumptions about future work that is outside the spec's stated scope.

## Status: assumptions-surfacer done — A-NNN list produced; recommendation issued; status: DONE
