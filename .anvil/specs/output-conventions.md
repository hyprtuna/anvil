# Output Conventions — Structured, Locatable Output for Every Anvil Surface

Every Anvil skill and agent produces output that a human or automated consumer can locate, parse, and act on without guesswork. This document is the canonical reference for the four-section structure, the four-state completion vocabulary, and the formatting rules that make Anvil output coherent across sessions.

---

## Why This Matters

Silent output is a correctness problem. When `git-worker` commits without printing the SHA, the next agent cannot verify what was committed. When `doc-writer` writes files without listing them, the reviewer cannot audit coverage. When a skill finishes without a status word, the orchestrator cannot route correctly.

Structured output solves three problems:

1. **Locatability** — you can scroll to `## Done` and know the outcome in one line.
2. **Chainability** — the next agent in the chain reads the status word (`DONE`, `BLOCKED`, etc.) and decides whether to proceed or escalate.
3. **Auditability** — every significant action leaves a traceable record (SHA, file path, PR URL).

---

## The Four-Section Structure

Every skill and agent output follows this structure. Sections 1 and 4 are mandatory. Sections 2 and 3 are mandatory when the skill produces intermediate planning or substantive output.

```
## Status
<role> starting — <one-line goal>

## Plan
(optional — include for multi-step work)
- Step 1: ...
- Step 2: ...
- Step 3: ...

## <Body section>
(## Findings, ## Changes, ## Output, ## Verification, ## Commit Status, etc.)
<the substantive work>

## Done
<role> done — <one-line summary>; status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED
```

### Section 1: `## Status` (mandatory)

The first non-frontmatter content of every skill or agent response. One line.

Format: `<role> starting — <one-line goal>`

Examples:
- `verifier starting — run test suite and lint before claiming completion`
- `git-worker starting — commit staged changes with conventional commit message`
- `code-reviewer starting — two-pass review of src/core/types.ts changes`

### Section 2: `## Plan` (optional)

Include when the work has more than two steps, or when the user would benefit from knowing the intended sequence before it runs. Use a short bulleted list of 3–5 steps.

```markdown
## Plan
- Read changed files and identify scope
- Run test suite
- Run lint and typecheck
- Report findings with evidence
```

Omit for trivial one-step operations (e.g., a single `git commit`).

### Section 3: Body Sections (mandatory when applicable)

Use the section name that best describes the output:

| Skill type | Preferred section heading |
|---|---|
| Verification / testing | `## Verification` |
| Code review | `## Findings` |
| File writes | `## Changes` or `## Documents Written` |
| Git operations | `## Commit Status` |
| GitHub / PR operations | `## PR Created` |
| Research / investigation | `## Findings` |
| Command output / build results | `## Output` |

Within the body section, every significant action must include its artifact:

- Git commits: SHA + branch + file list
- File writes: path + line count
- PRs: URL + number + title
- Test runs: pass/fail counts + exit code

### Section 4: `## Done` (mandatory)

The last line of every skill or agent response. One line.

Format: `<role> done — <one-line summary>; status: <STATE>`

Examples:
- `verifier done — 48 tests pass, lint clean, typecheck clean; status: DONE`
- `git-worker done — committed 3 files as feat: add skill validation; status: DONE`
- `code-reviewer done — 2 critical findings, 1 suggestion; status: DONE_WITH_CONCERNS`
- `tdd-worker done — waiting for failing test confirmation before proceeding; status: NEEDS_CONTEXT`
- `feature-developer done — blocked on unresolved architecture question (see ## Plan); status: BLOCKED`

---

## Four-State Completion Vocabulary

Every `## Done` line ends with one of exactly four states. These states are machine-readable and drive automated routing decisions.

### `DONE`
Ready for review / next stage. All acceptance criteria met. No unresolved concerns.

Use when:
- The task is fully complete
- All tests pass, all files are written, all commits are made
- There are no open questions

### `DONE_WITH_CONCERNS`
Completed but flagged doubts that the caller should review. Document the concerns before the `## Done` line.

Use when:
- The primary task is complete but you noticed something worth flagging
- Tests pass but coverage is thin in a critical area
- The implementation works but there is a known trade-off the caller should accept explicitly

Example:
```markdown
**Concern:** The retry logic uses a fixed 1s delay rather than exponential backoff.
This is fine for the current load but may cause thundering herd under traffic spikes.

## Done
git-worker done — committed feat: add retry logic; status: DONE_WITH_CONCERNS
```

### `NEEDS_CONTEXT`
Cannot complete because information that was not provided is required.

Use when:
- A required input (target branch, PR number, spec file) was not provided
- The prompt is ambiguous and both interpretations lead to materially different implementations
- A dependency is missing from the environment

Do not use `NEEDS_CONTEXT` for optional information. Only block when the missing information is truly required.

Example:
```markdown
## Done
github-worker done — target branch not specified; cannot create PR without a base branch; status: NEEDS_CONTEXT
```

### `BLOCKED`
Cannot complete. A hard blocker exists that cannot be resolved without external action.

Use when:
- Tests are failing and the fix is outside the scope of this skill
- A required dependency is not installed
- A conflicting change on the target branch prevents the operation

Example:
```markdown
## Done
tdd-worker done — blocked: 3 pre-existing test failures in src/core/config.test.ts unrelated to this task; status: BLOCKED
```

---

## Good Example — `verifier` (full output)

The following is an example of correctly-structured verifier output. Note the mandatory Status opener, the Plan section (multi-step), the Verification body with evidence, and the Done closer with status.

```markdown
## Status
verifier starting — verify test suite, lint, and typecheck before completion claim

## Plan
- Run npm test (full suite)
- Run npm run lint
- Run npm run typecheck
- Report each result with exit code and counts

## Verification

### Test suite
- **Command:** `npm test`
- **Result:** 1175 tests, 0 failures, 7 skipped, exit code 0
- **Status:** VERIFIED

### Lint
- **Command:** `npm run lint`
- **Result:** 0 errors, 0 warnings, exit code 0
- **Status:** VERIFIED

### Typecheck
- **Command:** `npm run typecheck`
- **Result:** 0 errors, exit code 0
- **Status:** VERIFIED

## Done
verifier done — all gates pass (1175 tests, lint clean, typecheck clean); status: DONE
```

---

## Bad Example — Silent `git-worker` (contrast)

The following represents what NOT to do. The output contains no Status opener, no Commit Status section with SHA/files, and no Done closer. A downstream agent or human reader cannot tell what was committed, to which branch, or whether it succeeded.

```markdown
# Git Worker

Done committing. All changes staged and committed with conventional commits header.
```

Problems:
- No `## Status` opener — unlocatable in a long session
- No SHA — cannot verify what was committed or reference it later
- No file list — cannot audit scope
- No branch — cannot determine where the commit landed
- No `## Done` with state — automated consumers cannot route

---

## Rules for All Skill/Agent Authors

1. **Always open with `## Status`** — first non-frontmatter content, one line.
2. **Always close with `## Done`** — last content, one line, ending in one of the four states.
3. **Never commit silently** — every git commit in a skill must print the SHA, branch, and file list.
4. **Never create files silently** — every file write must list the path and line count.
5. **Never create PRs silently** — every `gh pr create` must print the URL and PR number.
6. **Use `DONE_WITH_CONCERNS` over silent suppression** — if you noticed something, say it.
7. **Use the exact state vocabulary** — `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, `BLOCKED`. No variations.

---

## Integration with Automated Consumers

The `## Done — status: <STATE>` pattern is parsed by:

- **`agents/subagent-executor.md`** — reads the state from each subagent's output and routes: `DONE` → proceed to review; `DONE_WITH_CONCERNS` → read concerns before proceeding; `NEEDS_CONTEXT` → re-dispatch with the missing info; `BLOCKED` → escalate to user.
- **`agents/orchestrator.md`** — reports `BLOCKED` and `NEEDS_CONTEXT` subagents in its synthesis section before escalating.
- **`tests/unit/output-conventions.test.ts`** — static lint that asserts every D2-targeted skill body contains the Status opener and Done closer with a valid state word.

---

## Applying to Skills: The D2 Set

The following 13 skills are required to emit `## Status` openers and `## Done — status: <STATE>` closers in their output:

`feature-developer`, `tdd-worker`, `verifier`, `code-reviewer`, `review-responder`, `git-worker`, `github-worker`, `doc-writer`, `debugger`, `slop-remover`, `silent-failure-hunter`, `researcher`, `deep-diver`

---

## Applying to Agents: The D5 Set

All agents under `agents/` are required to emit:

- `## Status: <agent-name> starting — <one-line role/goal>` as the first non-frontmatter content
- `## Status: <agent-name> done — <summary>; status: <STATE>` as the last content

The 16 agents: `orchestrator`, `ultra-worker`, `code-architect`, `code-explorer`, `code-reviewer`, `plan-verifier`, `strict-reviewer`, `retroactive-validator`, `silent-failure-hunter`, `test-analyzer`, `code-simplifier`, `doc-verifier`, `framework-selector`, `mcp-builder`, `researcher`, `type-design-analyzer`

---

## Static-then-variable agent prompts

Hot-path agents — those frequently re-dispatched within a single session (currently `orchestrator`, `ultra-worker`, `code-reviewer`) — wrap all static instruction content in a single `<instructions>...</instructions>` block placed immediately after the opening status marker. Variable content (the user goal, current iteration, diff being reviewed, runtime hints) appears after the closing `</instructions>` tag. This structure lets Claude Code's prompt cache amortise the cost of the static boilerplate across all re-dispatches in a wave; only the variable suffix is re-hashed on each invocation. Any future agent that will be dispatched more than once in a typical session should follow this same static-then-variable layout. The presence of the `<instructions>` block is asserted by `tests/unit/agents/prompt-prefix.test.ts`.

---

## Cross-References

- `agents/CLAUDE.md` — agent authoring conventions (includes pointer to this doc)
- `skills/CLAUDE.md` — skill authoring conventions (includes pointer to this doc)
- `skills/universal/verifier.md` — canonical example of structured verification output
- `tests/unit/output-conventions.test.ts` — static lint assertions for all targeted files
- `tests/unit/agents/prompt-prefix.test.ts` — structural assertion that hot-path agents have `<instructions>` prefix blocks
