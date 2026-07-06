---
name: code-review
description: 'Use when reviewing diffs or files for quality, security, style, or test coverage — emits severity-graded findings (>=80% confidence).'
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: review
  disambiguator: 'graded reviewer — severity-tagged findings with file:line'
  trigger: [review, code review, pr review, lgtm]
  language: universal
  notepads_section: verification
  templates: [code-review]
  composition: {chains: [{after: test-driven-development}, {after: feature-development}, {before: github-workflow}, {before: gitlab-workflow}]}
---

> **Invoke via `Skill({skill: "anvil:code-review"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
code-reviewer starting — reviewing code changes with severity-graded findings at >=80% confidence

**Announce:** I'm using the code-review skill to identify severity-graded findings in the diff or files under review.

# Code Reviewer

Review with rigor. Report only findings you're >=80% confident about.

${TEMPLATE:code-review}

## Prompt override (parse before asking)

Before presenting any question, scan the user's prompt for a location override:

```
regex: /store (this )?(at|in|to) (\S+)/i
```

If matched, use the captured path as the Q1 answer without asking Q1. Continue to Q2 (format) regardless — a prompt-time location override does not imply a format preference.

## Q1 — Location

Check whether preferences are already resolved (call `resolvePreferenceFor('review', { cwd, anvilHome })` from `src/core/preferences.ts`; if it returns `{ location, format, source }`, skip both Q1 and Q2 and proceed directly to writing). Otherwise:

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "Where should the review output be stored?",
  "intro": "Choose where to write the review artifact. Location and format are independent — you will be asked about format next.",
  "options": [
    {
      "label": ".anvil/reviews/<slug> (Recommended)",
      "description": "In-project Anvil tree; directory created if missing. Integrates with Anvil tooling."
    },
    {
      "label": "docs/reviews/<slug>",
      "description": "In-project public-shaped docs; visible in rendered documentation."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/reviews/<slug>",
      "description": "Out-of-project; keeps the project repo clean. Only shown when ~/.anvil/ exists."
    },
    {
      "label": "Custom path",
      "description": "Relative path you provide. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Keeps review artifacts co-located with the project and accessible to Anvil commands."
}
```

Note: only show the `~/.anvil/projects/` option when `~/.anvil/` exists on the system.

After the user picks:
- `.anvil/reviews/<slug>` → `mkdir -p .anvil/reviews/` if missing.
- `docs/reviews/<slug>` → no directory creation needed.
- `~/.anvil/projects/` → use the out-of-project path as-is.
- Custom path → validate: must be relative, no `..` segments, no cwd escape. Surface a clear error and re-prompt if invalid.

## Q2 — Format

Invoke AskUserQuestion with the following payload:

```json
{
  "question": "What format should the review output use?",
  "intro": "Machine-readable JSON integrates with Anvil tooling and is reloadable by anvil agent lint. Markdown renders in GitHub PRs and diffs. Both writes two files at the chosen location.",
  "options": [
    {
      "label": "Machine-readable (JSON) (Recommended)",
      "description": "Structured JSON; validates against ReviewReport schema; consumable by anvil agent lint."
    },
    {
      "label": "Markdown",
      "description": "Human-readable severity-graded review with section headers; renders in PR diffs and on GitHub."
    },
    {
      "label": "Both",
      "description": "Write both a .json and a .md file at the chosen location."
    }
  ],
  "_rationale": "Schema-validated and reloadable by Anvil tooling; enables automated review aggregation."
}
```

## Load addendum if needed

When the user picks **JSON** or **Both** as the format, load [`./plan30-addendum.md`](./plan30-addendum.md) for the structured JSON schema reference before writing output. The markdown-only path uses the generic review body below — do not load the addendum.

## Persist preferences

After both Q1 and Q2 are answered (or resolved from an override), persist the selections:

```
persistPreference('review', { location, format }, { cwd, anvilHome })
```

On subsequent invocations the skill reads this preference and skips both questions.

## Rules

Skip style/taste issues unless they violate declared project conventions (CLAUDE.md, .editorconfig, lint config).

## Sibling sub-tasks

Two semantic review passes are available as sibling prompt files, dispatched via
`Task(general-purpose)` rather than as named agents:

- **Comment review (staleness / contradiction / AI-slop).** Dispatch
  `Task(general-purpose)` with the body of
  [`./comment-analyzer-prompt.md`](./comment-analyzer-prompt.md) when the
  reviewer needs LLM-grade semantic comment findings beyond regex-grade checks.
  Emits structured output.

- **TypeScript type-design audit.** Dispatch `Task(general-purpose)` with the
  body of [`./type-design-analyzer-prompt.md`](./type-design-analyzer-prompt.md)
  when the review target is TypeScript-heavy and you want to catch unnecessary
  optionality, over-wide unions, missing brand types, or under-constrained
  generics.

Both prompts are read-only — they emit findings and never edit code.

## Done
code-reviewer done — all findings reported with severity tags and file:line references; status: DONE
