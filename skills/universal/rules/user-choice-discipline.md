---
name: user-choice-discipline
user-invocable: false
description: 'When a skill body has a workflow fork, present location options to the user with AskUserQuestion; do not detect-and-assume.'
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  type: rule
  expected_tokens: 600
  tags: [user-choice, location-driven, pattern, rule, priority]
---

# user-choice-discipline

## The rule

<HARD-GATE phase="workflow-fork">
When a skill generates an artifact and has a workflow fork (different output paths, different
formats, different destinations), the skill MUST present TWO independent `AskUserQuestion` prompts:

1. **Q1 — Where to store?** Options include `.anvil/<kind>/` (Recommended), `docs/<kind>/`,
   `~/.anvil/projects/<auto-name>/<kind>/` (if `~/.anvil/` exists), and a custom-path option.
2. **Q2 — What format?** Exactly three options: Machine-readable (JSON), Markdown, Both.

The skill MUST NOT detect whether `.anvil/` exists and silently pick location or format.
The skill MUST NOT couple location to format — they are independent dimensions.

The rule: **ask both questions, do not detect-and-assume either.**

This gate lifts ONLY when:
- Two `AskUserQuestion` payloads are rendered at the workflow fork (Q1 then Q2).
- Q1 includes ≥3 options, one of which references `.anvil/<kind>/` and is marked Recommended.
- Q2 includes exactly 3 options (JSON / Markdown / Both), one marked Recommended.
- Both the user's location response AND format response drive the output — not file-system detection.
- Preferences are checked first (via `resolvePreferenceFor` from `src/core/preferences.ts`, ANV-0199);
  if a stored preference exists, both questions may be skipped.
</HARD-GATE>

## Why detect-and-assume breaks adoption

If a skill silently picks Anvil-flavored output only when `.anvil/` already exists, it creates a
chicken-and-egg problem: the directory never gets created on first use, so new projects never get
Anvil-flavored output, so they never benefit from Anvil tooling integration. The two-question
pattern breaks this cycle — the user can opt into Anvil structure on the first run, and the skill
creates the directory if it does not exist.

Coupling location to format creates a second failure: a user who wants `.anvil/reviews/` AND
markdown cannot express that in a single-question pattern. The cross-product of locations and
formats must be available — hence two independent questions.

## How to apply

See the full pattern reference: [`docs/skills/user-choice-pattern.md`](../../../docs/skills/user-choice-pattern.md).
Preferences API: `src/core/preferences.ts` (ANV-0199) — `resolvePreferenceFor` + `persistPreference`.

Short form:

1. **Prompt override check.** Parse the user's prompt for explicit location hints
   (`/store (this )?(at|in|to) (\S+)/i`). If matched, extract the path and skip Q1.
2. **Preference check.** Call `resolvePreferenceFor(kind, { cwd, anvilHome })`.
   - `{ source: 'per-kind' }` → skip both Qs; use stored location and format.
   - `{ source: 'default' }` → use defaults; consider skipping.
   - `null` → ask both Qs.
3. **Q1 — location.** Construct a `DecisionPrompt` (see `src/core/templates/decision.ts`).
   Set the `.anvil/<kind>/` option as `recommended: true`. Include ≥3 options.
4. **Q2 — format.** Construct a second `DecisionPrompt` with exactly 3 options (JSON / Markdown /
   Both). Render with `renderDecisionClaudeCode` and surface via a second `AskUserQuestion`.
5. **Post-selection.** After both responses:
   - `.anvil/<kind>/` → bootstrap the directory silently (`mkdir -p`).
   - Custom path → validate (relative, no `..`, no cwd escape).
   - JSON → write `<name>.json`; Markdown → write `<name>.md`; Both → write both.
6. **Persist.** Call `persistPreference(kind, { location, format }, { cwd, anvilHome })`.

## Kind taxonomy

Use the canonical `${ANVIL_*}` tokens when referencing artifact directories in skill prose.
See `src/core/artifact-paths.ts` for the full token vocabulary and resolved paths.

| Artifact type | Token |
|---|---|
| plan | `${ANVIL_PLANS_DIR}` |
| spec | `${ANVIL_FEATURES_DIR}/<slug>/` |
| research | `${ANVIL_RESEARCH_DIR}` |
| decision | `${ANVIL_ROOT}/decisions/` |
| audit | `${ANVIL_AUDITS_DIR}` |
| review | `${ANVIL_ROOT}/reviews/` |
| ADR | `${ANVIL_ROOT}/adrs/` |

## Red flags (thoughts that mean STOP)

| Thought | Reality |
|---|---|
| "I'll check if `.anvil/` exists and pick automatically" | Detect-and-assume. Show the Q1 choice instead. |
| "The user probably wants Anvil format" | Probably is not agency. Ask. |
| "Location implies format — I only need one question" | They are independent. Ask both. |
| "The skill is simple — no fork needed" | If the output destination or format can vary, there is a fork. Show both questions. |
| "I'll add the prompts later" | Later means never. The fork is now; both prompts are now. |
| "I'll skip Q2 because the user picked .anvil/" | Format is independent of location. Ask Q2 regardless. |

## Reference

- Full pattern: `docs/skills/user-choice-pattern.md`
- Primitive: `src/core/templates/decision.ts` → `DecisionPrompt`, `renderDecisionClaudeCode`
- Preferences: `src/core/preferences.ts` (ANV-0199) → `resolvePreferenceFor`, `persistPreference`
- Example skill: `skills/universal/rules/examples/user-choice-example.md`
- Tickets applying the pattern: ANV-0188 (`code-review`), ANV-0189 (`plan-writing`, `default-feature`)
