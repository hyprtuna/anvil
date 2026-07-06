---
name: brainstorm-spec
description: 'Use when the user describes a feature without an approved spec; output is a structured spec with an Assumptions section, a decisions block, and an Open Questions section'
model: opus
permissionMode: default
color: cyan
tools: [Read, Glob, Grep, Bash, Edit]
user-invocable: true
context: fork
x-anvil:
  kind: atomic
  group: planning
  language: universal
  trigger: [brainstorm spec, spec brainstorm, assumptions-first]
  templates: [specs]
---

# Brainstorm Spec

**Announce:** I'm using the brainstorm-spec skill to transform an under-specified goal into a rigorous, approval-gated spec before any planning or implementation begins.

<HARD-GATE phase="research→spec">
DO NOT write implementation files, create plan files, or invoke plan-writing until the
user has reviewed and explicitly approved the spec you produced.

letter = spirit: the intent of this gate is that no implementation work begins before
the spec's assumptions, decisions, and acceptance criteria are agreed upon. Emitting a
"looks good" and moving forward violates the gate — you must receive explicit approval.

This gate lifts ONLY when the user responds with explicit confirmation:
"approved", "looks good, proceed to plan", "go ahead", or equivalent.
A vague acknowledgment ("ok", "sure", "yes") is not approval.

Gate checklist before exiting:
- [ ] Spec file written with all required sections (Goal, Context, Assumptions,
      Decisions, Acceptance Criteria, Open Questions, Out of Scope)
- [ ] ## Open Questions section present (even if empty: "- (none)")
- [ ] Approval handshake emitted (one-line summary + "confirm before running plan-writing")
- [ ] User has replied with explicit approval
</HARD-GATE>

## Purpose

Generate a spec file that:

1. Captures all non-obvious assumptions derived from the codebase scan.
2. Records explicit architectural decisions with rationale.
3. Defines acceptance criteria that the implementation must satisfy.
4. Provides enough context for `plan-writing` to produce a complete plan without asking for clarification.

The output file is the single source of truth for a feature or change.

## Sibling sub-task: assumptions-surfacer

After producing the initial spec draft and decisions, dispatch a read-only
sub-task to surface hidden assumptions before the spec is approved for plan-writing.

**Dispatch:** `Task(general-purpose)` with the body of
[`./assumptions-surfacer-prompt.md`](./assumptions-surfacer-prompt.md) as the prompt.

The sub-task returns an `A-NNN:` numbered list with codebase citations and a
recommendation on whether each assumption should be elevated to a formal decision.
Any assumption marked `elevation: yes` MUST become a decision before `plan-writing` runs.

## Inputs

Accept any of the following from the user:

| Input | Description |
|---|---|
| Goal statement | A natural-language description of the feature or change |
| `--assumptions-first` | Skip open-ended Q&A; enumerate assumptions from codebase scan, ask for corrections only (see §Assumptions-First Mode) |
| `Spec file: <path>` | Path to an existing partial spec to enrich |
| `Plan file: <path>` | Path to a plan that should be retroactively backed by a spec |

## Prompt override (parse before asking)

Before presenting any question, scan the user's prompt for a location override:

```
regex: /store (this )?(at|in|to) (\S+)/i
```

If matched, use the captured path as the Q1 answer without asking Q1. Continue to Q2 (format) regardless.

## Q1 — Location

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "Where should the spec be stored?",
  "intro": "Choose where to write the spec. Storing under .anvil/specs/ integrates with plan-writing tooling. Location and format are independent — you will be asked about format next.",
  "options": [
    {
      "label": ".anvil/specs/features/<slug>/spec.md (Recommended)",
      "description": "In-project specs directory; created if missing. Enables the brainstorm-spec → plan-writing chain and decision coverage checks."
    },
    {
      "label": "docs/specs/<slug>.md",
      "description": "In-project public-shaped docs. Use when you want the spec visible in published documentation."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/specs/<slug>.md",
      "description": "Out-of-project; keeps your project repo clean of generated artifacts. Only shown when ~/.anvil/ exists."
    },
    {
      "label": "Custom path",
      "description": "Relative path you provide. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Integrates with plan-writing and plan-verifier; the directory is bootstrapped on first use."
}
```

Note: only show the `~/.anvil/projects/` option when `~/.anvil/` exists on the system.

After the user picks: bootstrap the chosen directory silently if missing (`mkdir -p`); for custom paths, validate the path is relative, has no `..` segments, and does not escape the project root. The Anvil-slate path additionally triggers the SDD layout — see the addendum for details.

## Q2 — Format

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "What format should the spec use?",
  "intro": "Anvil-spec adds structured decisions grammar (decisions block + numbered IDs) required by plan-writing. Markdown is a human-readable spec without tooling dependencies.",
  "options": [
    {
      "label": "Anvil-spec (decisions block + numbered decision IDs) (Recommended)",
      "description": "Adds a structured decisions block with numbered IDs and YAML frontmatter required by plan-writing and plan-verifier decision coverage checks."
    },
    {
      "label": "Markdown",
      "description": "Plain markdown spec without structured decision grammar; best when plan-writing is not part of the workflow."
    },
    {
      "label": "Both",
      "description": "Write both an Anvil-spec and a plain markdown version at the chosen location; use when both tooling and human audiences matter."
    }
  ],
  "_rationale": "Anvil-spec enables decision coverage checks; markdown serves human readers and projects not using Anvil plan tooling."
}
```

## Load addendum if needed

When the user picks **Anvil-spec** or **Both** as the format, load
[`./anvil-addendum.md`](./anvil-addendum.md) for the structured decisions block grammar,
D-NN decision ID convention, and plan-verifier compliance requirements. The markdown-only
path uses just the generic spec body below — do not load the addendum.

## Process

### Step 1: Codebase Scan

Before asking any questions, scan the codebase to establish ground truth:

1. Read `CLAUDE.md` (project root + any relevant subfolder `CLAUDE.md` files).
2. Glob the directories relevant to the goal (`src/`, `skills/`, `agents/`, etc.).
3. Grep for existing implementations, naming patterns, and related tests.
4. Identify:
   - Existing abstractions you must respect or extend.
   - Layer boundaries that must not be violated.
   - Naming conventions already in use.
   - Test patterns and coverage gaps.

Record every finding. These become your assumption candidates.

### Step 2: Assumption Extraction

From the codebase scan, extract all non-obvious assumptions:

- **Architectural assumptions:** "This feature lives in a pure utility layer; it must have no I/O."
- **Interface assumptions:** "The output schema must be exported from the types module."
- **Behavioral assumptions:** "The parser handles case-insensitive tags because the existing code does."
- **Constraint assumptions:** "The skill cannot increase the user-invocable count beyond the configured limit."

Number each assumption (A-001, A-002, …) for traceability.

### Step 3: Decision Derivation

For each assumption that requires a deliberate design choice, elevate it to a **decision**.

An assumption becomes a decision when there are two or more reasonable alternatives.

Record each decision with:
- A unique numbered ID (e.g., D-01, D-02)
- The question being decided
- The options considered
- The chosen option and rationale

You must produce at least one decision for any non-trivial spec.

### Step 4: Open Questions (default mode only)

In default mode (without `--assumptions-first`):

- List any remaining ambiguities that the codebase scan could not resolve.
- Present them as numbered questions to the user.
- Wait for answers before drafting the spec.

Skip this step entirely in `--assumptions-first` mode.

**`## Open Questions` section is mandatory in every spec output** (even when empty):

Every spec MUST end with an `## Open Questions` section followed by a bulleted list.
If there are no open questions, use the literal text `- (none)`.

### Step 5: Spec Authoring

Write the spec file to the user's chosen location from Q1.

The spec file MUST contain:

1. YAML frontmatter (see Output Format).
2. A `## Goal` section.
3. A `## Context` section (codebase summary relevant to the goal).
4. A `## Assumptions` section (numbered list from Step 2).
5. A decisions section (from Step 3) — format depends on Q2 choice; see addendum for Anvil-spec grammar.
6. A `## Acceptance Criteria` section (machine-verifiable where possible).
7. A `## Out of Scope` section.
8. A `## Open Questions` section — **mandatory even when empty** (use `- (none)`).

---

## Output Format

${TEMPLATE:specs}

---

## Assumptions-First Mode

Invoke this mode by including `--assumptions-first` in your input or by starting with "assumptions-first".

**Behavior change:** Skip the open-ended Q&A entirely. Instead:

1. Complete Steps 1–2 (Codebase Scan + Assumption Extraction) as normal.
2. Present the numbered assumption list to the user immediately:

   ```
   I've scanned the codebase. Here are my assumptions — correct any that are wrong:

   A-001: ...
   A-002: ...
   A-003: ...

   Which (if any) are incorrect? I'll update and proceed to drafting the spec.
   ```

3. Wait for the user's corrections (or confirmation that all assumptions are correct).
4. Apply corrections, derive decisions, and write the spec.

This mode is designed for experienced users who want to skip interactive Q&A and immediately see the model's understanding of the codebase. It is faster but requires the user to spot wrong assumptions rather than answering open questions.

---

## User-Approval Handshake (mandatory before exit)

After writing the spec file, you MUST emit this one-line approval prompt and then STOP.
Do not proceed to plan-writing, implementation, or any further action until the user
explicitly confirms.

Emit exactly:

> **Spec drafted at `<path>`. Review and confirm before running plan-writing.**

Then wait. Do NOT continue. Do NOT call `plan-writing`. Do NOT summarize next steps beyond
the one-line above. The HARD-GATE lifts only after the user's explicit approval response.

---

## REQUIRED SUB-SKILL: plan-writing

After the user has explicitly approved the spec, the next step in the chain is
`plan-writing`. Hand the approved spec path to plan-writing and let it produce the
phased implementation plan. Do not skip plan-writing in favor of inline planning,
even for "small" specs. The canonical chain is `brainstorm-spec → plan-writing → subagent-execution → finishing-branch` — quality gates live in `subagent-execution`'s two-stage review cycles.

---

## Quality Checklist

Before emitting the approval handshake, verify:

- [ ] Every assumption that involves a choice has a corresponding decision.
- [ ] Acceptance criteria are verifiable (not "it should feel fast" — be specific).
- [ ] Out-of-scope items are explicit enough to prevent scope creep.
- [ ] The spec is self-contained: a reader who has not seen the conversation can understand it.
- [ ] `## Open Questions` section is present (with `- (none)` if empty).
- [ ] (If Anvil-spec format) Additional checks from `anvil-addendum.md` are satisfied.
