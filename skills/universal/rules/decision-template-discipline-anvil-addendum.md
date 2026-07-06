# decision-template-discipline — Anvil Addendum

> This addendum is loaded when running inside an Anvil project (`.anvil/` detected).
> It provides the TypeScript implementation contract for the auto-mode decision system
> and the `.anvil/decisions/` audit trail path. Generic context does not need this.

## When This Addendum Applies

Load this addendum when:
- The runtime is operating inside an Anvil project (`.anvil/` directory exists).
- The skill is implementing the auto-mode decision contract in TypeScript.

## TypeScript Auto-Mode Contract

```ts
import {
  resolveDecisionAutoMode,
  writeDecisionAuditEntry,
} from '@anvil/core/templates'

const outcome = resolveDecisionAutoMode(prompt, {
  enabled: ctx.autoMode,           // boolean
  acceptDefaults: ctx.acceptDefaults, // boolean
  anvilRoot: ctx.anvilRoot,
})

if (outcome.action === 'auto-select') {
  writeDecisionAuditEntry(prompt, outcome, ctx.anvilRoot)
  // proceed with outcome.selectedLabel
} else {
  // outcome.action === 'wait'
  // surface the prompt and WAIT — do not pick an option
}
```

## Audit Trail Path

When auto-mode selects an option, write the audit entry to:

```
.anvil/decisions/<timestamp>.json
```

The audit entry shape:

```json
{
  "question": "<the decision question text>",
  "selected_label": "<the label of the auto-selected option>",
  "reason": "accept-defaults | auto-mode-high-confidence",
  "timestamp": "<ISO 8601 datetime>",
  "prompt_confidence": "high"
}
```

The `.anvil/decisions/` directory is created silently if missing.

## Why the Audit Trail Matters

The audit trail is the user's only retroactive view into what the agent decided on
their behalf during an autonomous run. Without it, auto-selected decisions are
invisible in the commit history.

`anvil doctor` checks that the audit trail directory exists and is writable when
auto-mode is enabled.

## resolveDecisionAutoMode Contract

`resolveDecisionAutoMode(prompt, ctx)` returns:

```ts
type AutoModeOutcome =
  | { action: 'auto-select'; selectedLabel: string; reason: string }
  | { action: 'wait' }
```

- Returns `auto-select` only when: `ctx.acceptDefaults === true` OR
  (`ctx.enabled === true` AND `prompt.confidence === 'high'`).
- Returns `wait` in all other cases — including when `prompt.confidence` is
  `undefined`, `'medium'`, or `'low'`.
- Never returns `auto-select` when there is no `recommended: true` option in
  the prompt's options array.

## writeDecisionAuditEntry Contract

`writeDecisionAuditEntry(prompt, outcome, anvilRoot)`:

- Creates `.anvil/decisions/` if missing.
- Writes one JSON file per auto-selection using the timestamp as the filename.
- Never throws — if the write fails, it logs a warning and continues.
- `anvilRoot` is the absolute path to the project's `.anvil/` parent directory.
