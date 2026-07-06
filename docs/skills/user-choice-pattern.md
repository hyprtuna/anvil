# User-Choice Prompt Pattern

> Canonical reference for the two-question user-choice pattern used by skills that generate
> artifacts. **Location and format are independent choices** — each gets its own `AskUserQuestion`.
> Related rule skill: `skills/universal/rules/user-choice-discipline.md`.
> Primitive: `src/core/templates/decision.ts`.
> Persistence API: `src/core/preferences.ts`.

## When to apply

Apply this pattern when a skill **generates an artifact** — any output the user will store somewhere:

- Release plan
- Feature spec
- Research note
- Decision record
- Audit report
- Code-review report
- Architecture Decision Record (ADR)

Any time the skill body has a **workflow fork** where destination or format varies, the skill must
present both choices to the user rather than detecting the project structure and assuming silently.

## The problem with detect-and-assume

A skill that silently checks whether `.anvil/` exists and picks "Anvil-flavored" or "generic" creates
a chicken-and-egg bootstrap failure: new projects never have `.anvil/`, so they always get generic
output, so they never adopt Anvil structure. The two-question pattern breaks this cycle — the user
can opt into Anvil structure on the very first run, and the skill creates the directory if missing.

## The two-question pattern

### Q1 — Where to store?

Use `DecisionPrompt` from `src/core/templates/decision.ts`. The `.anvil/<kind>/` option is
`recommended: true`. Standard option set (four options):

```typescript
import {
  DecisionPrompt,
  renderDecisionClaudeCode,
} from '../../src/core/templates/decision.js'

const locationPrompt = DecisionPrompt.parse({
  question: 'Where should the research note be stored?',
  explanation:
    'Storing under .anvil/research/ integrates with Anvil tooling ' +
    '(search, cross-linking, structured frontmatter). ' +
    'Storing under docs/research/ keeps the artifact in your published docs. ' +
    'Out-of-project storage keeps your repo clean.',
  options: [
    {
      label: '.anvil/research/ (Recommended)',
      description:
        'In-project Anvil tree; created if missing. ' +
        'Integrates with Anvil tooling — search, cross-linking, structured frontmatter.',
      recommended: true,
      rationale:
        'Picks up structured frontmatter and Anvil cross-linking; ' +
        'the directory is bootstrapped on first use.',
    },
    {
      label: 'docs/research/',
      description:
        'In-project public-shaped docs. ' +
        'Use when you want the artifact in your repo\'s published docs.',
    },
    // Only include when ~/.anvil/ exists on disk:
    {
      label: '~/.anvil/projects/<auto-name>/research/',
      description:
        'Out-of-project; keeps your project repo clean of generated artifacts.',
    },
    {
      label: 'Other (custom path)',
      description:
        'Provide a relative path. Must not contain ".." or escape the project root.',
    },
  ],
  confidence: 'high',
})

const locationPayload = renderDecisionClaudeCode(locationPrompt)
// Hand locationPayload to AskUserQuestion.
```

> **Note on the `~/.anvil/` option:** show this option only when `~/.anvil/` exists on the user's
> machine. In the example skill, it is always listed as a demonstration; real skills should gate it.

### Q2 — What format?

After the user responds to Q1, ask Q2 independently. Format and location are orthogonal — a user
can want `.anvil/research/` AND markdown, or `docs/research/` AND JSON.

```typescript
const formatPrompt = DecisionPrompt.parse({
  question: 'What format should the research note use?',
  explanation:
    'Choose based on who will read the artifact and which tools need to consume it.',
  options: [
    {
      label: 'Machine-readable (JSON) (Recommended)',
      description:
        'Structured, schema-validated, consumable by tooling like `anvil agent lint`; ' +
        'best when other tools will read this.',
      recommended: true,
      rationale:
        'Tooling can validate and cross-link structured JSON; ' +
        'human-readable fallback via `anvil show`.',
    },
    {
      label: 'Markdown',
      description:
        'Human-readable narrative; renders in PR diffs and on GitHub; ' +
        'best when humans will read this.',
    },
    {
      label: 'Both',
      description:
        'Write both files at the chosen location; use when both audiences matter.',
    },
  ],
  confidence: 'high',
})

const formatPayload = renderDecisionClaudeCode(formatPrompt)
// Hand formatPayload to AskUserQuestion.
```

### Persistence integration

Before presenting either question, check stored preferences:

```typescript
import { resolvePreferenceFor, persistPreference } from '../../src/core/preferences.js'

const pref = await resolvePreferenceFor(kind, { cwd, anvilHome })

if (pref?.source === 'per-kind') {
  // Both questions skipped — use pref.location and pref.format
} else {
  // Ask both questions, then persist
  // ...
  await persistPreference(kind, { location, format }, { cwd, anvilHome })
}
```

`resolvePreferenceFor` returns:
- `{ location, format, source: 'per-kind' }` — both Qs skipped
- `{ location, format, source: 'default' }` — use defaults; consider skipping
- `null` — ask both Qs, then persist

> **Prompt override:** before consulting preferences, parse the user's prompt for explicit location
> hints (e.g. "store this at `/tmp/foo`") using a simple regex:
> `/store (this )?(at|in|to) (\S+)/i`. If matched, use the extracted path and skip Q1.

### Post-selection actions

| Q1 (location) | Q2 (format) | Action |
|---|---|---|
| `.anvil/<kind>/` | JSON | `mkdir -p .anvil/<kind>/`; write `<name>.json` with structured frontmatter |
| `.anvil/<kind>/` | Markdown | `mkdir -p .anvil/<kind>/`; load `anvil-addendum.md`; write `<name>.md` |
| `.anvil/<kind>/` | Both | `mkdir -p .anvil/<kind>/`; write both files |
| `docs/<kind>/` | any | Write in generic format at `docs/<kind>/`; no directory bootstrap |
| Custom path | any | Validate path first; write in chosen format |

### Bootstrap behavior

If the user picks `.anvil/<kind>/` and the directory does not exist, create it silently:

```
mkdir -p .anvil/<kind>/
```

No prompt. No confirmation. The user already expressed intent by picking that location.

### Path validation (custom paths)

When the user picks "Other (custom path)", validate before writing:

- Path must be relative (no leading `/`).
- Path must not contain `..` segments.
- Path must not resolve outside the current working directory.

If validation fails, surface a clear error and re-prompt.

## Kind taxonomy

The `<kind>` segment in `.anvil/<kind>/` is determined by the artifact type:

| Artifact type | Recommended path |
|---|---|
| plan | `.anvil/plans/` |
| spec | `.anvil/specs/features/<slug>/` |
| research | `.anvil/research/` |
| decision | `.anvil/decisions/` |
| audit | `.anvil/audits/` |
| review | `.anvil/reviews/` |
| ADR | `.anvil/adrs/` |

## Fully-worked skill body example

The following is a minimal skill body applying the two-question pattern for a "research note".
It uses the `DecisionPrompt` primitive from `src/core/templates/decision.ts` for both questions.

```markdown
---
name: example-research-note
user-invocable: false
kind: meta
group: research
description: Generates a structured research note and asks where to store it (two-question pattern).
preferred_model: sonnet
preferred_effort: medium
tools: []
---

# example-research-note

**Announce:** I'm using the example-research-note skill to produce a structured research note.

## Status

Gathering information…

[… skill body does research work here …]

## Q1 — Location choice

At this workflow fork, I ask the user where the research note should be stored.
Location and format are independent — I do not detect-and-assume either.

Invoke AskUserQuestion with the following payload:

\`\`\`json
{
  "question": "Where should the research note be stored?",
  "intro": "Storing under .anvil/research/ integrates with Anvil tooling (structured frontmatter, search, cross-linking). Storing under docs/research/ keeps the artifact in your published docs. Out-of-project storage keeps your repo clean.",
  "options": [
    {
      "label": ".anvil/research/ (Recommended)",
      "description": "In-project Anvil tree; created if missing. Integrates with Anvil tooling — search, cross-linking, structured frontmatter."
    },
    {
      "label": "docs/research/",
      "description": "In-project public-shaped docs. Use when you want the artifact in your repo's published docs."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/research/",
      "description": "Out-of-project; keeps your project repo clean of generated artifacts."
    },
    {
      "label": "Other (custom path)",
      "description": "Provide a relative path. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Picks up structured frontmatter and Anvil cross-linking; bootstrapped on first use."
}
\`\`\`

## Q2 — Format choice

Now ask the user what format the research note should use. Format is independent of location.

Invoke AskUserQuestion with the following payload:

\`\`\`json
{
  "question": "What format should the research note use?",
  "intro": "Choose based on who will read the artifact and which tools need to consume it.",
  "options": [
    {
      "label": "Machine-readable (JSON) (Recommended)",
      "description": "Structured, schema-validated, consumable by tooling like \`anvil agent lint\`; best when other tools will read this."
    },
    {
      "label": "Markdown",
      "description": "Human-readable narrative; renders in PR diffs and on GitHub; best when humans will read this."
    },
    {
      "label": "Both",
      "description": "Write both files at the chosen location; use when both audiences matter."
    }
  ],
  "_rationale": "JSON enables tooling validation; markdown serves human readers in PRs and on GitHub."
}
\`\`\`

After the user picks location and format:

- `.anvil/research/` → `mkdir -p .anvil/research/`; load `anvil-addendum.md` if markdown; write with structured frontmatter.
- `docs/research/` → write with generic format; no directory creation.
- Custom path → validate (relative, no `..`, no cwd escape); write with generic format.
- JSON → write `<name>.json`; Markdown → write `<name>.md`; Both → write both files.

## Done — status: DONE
```

## Primitive reference

```typescript
// src/core/templates/decision.ts (layer 0 — safe to import anywhere)

DecisionPrompt       // Zod schema — parse + validate the prompt object
DecisionOption       // Zod schema — one option in the prompt
renderDecisionClaudeCode(prompt)  // → AskUserQuestionPayload (for Claude Code)
renderDecisionOpenCode(prompt)    // → opencode-flavored markdown string
renderDecisionMarkdown(prompt)    // → plain markdown fallback
renderDecisionPrompt(prompt, surface)  // → surface-dispatching renderer

// AskUserQuestionPayload shape:
// { question: string; intro: string; options: {label, description}[]; _rationale?: string }

// src/core/preferences.ts (preferences persistence)
resolvePreferenceFor(kind, { cwd, anvilHome })  // → { location, format, source } | null
persistPreference(kind, { location, format }, { cwd, anvilHome })  // → void
```

## AskUserQuestion payload shape

### Q1 (location) conformance requirements

- `question` — non-empty string.
- `intro` — non-empty string explaining why the choice is being presented.
- `options` — array of `{label, description}`, **length ≥ 3**.
- At least one option label includes `.anvil/`.
- Exactly one option label contains `(Recommended)`.
- Each option `description` is non-empty (explains the trade-off, not just the label).
- `_rationale` — optional; the one-liner justifying the recommendation.

### Q2 (format) conformance requirements

- `question` — non-empty string.
- `intro` — non-empty string.
- `options` — **exactly 3**: Machine-readable (JSON), Markdown, Both.
- Exactly one option label contains `(Recommended)`.
- Each option `description` is non-empty and explains the trade-off (≥1 sentence).

## Forward-compat note

A future ticket ( targeted for v0.15.4) will introduce a "which template?" sub-question
folded into this same flow. The pattern accommodates it: after Q1 and Q2, a third `AskUserQuestion`
can ask which template to apply. The existing `DecisionPrompt`/`renderDecisionClaudeCode` calls
remain unchanged; the template sub-question slots in before the artifact is rendered.

## Related

- Rule skill: `skills/universal/rules/user-choice-discipline.md`
- Primitive: `src/core/templates/decision.ts`
- Persistence: `src/core/preferences.ts`
- Example skill: `skills/universal/rules/examples/user-choice-example.md`
- E2E test: `tests/integration/skill-e2e/user-choice-pattern/`
- Tickets adopting the pattern: (`code-review`), (`plan-writing`, `default-feature`)
