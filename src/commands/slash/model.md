---
name: model
description: Set or show the model for the current session (writes .anvil/active-model.json)
argument-hint: "[<model-id>] [--effort <level>]"
user-invocable: true
---

# /model — Session model override

Use `/model` to pin a specific model and effort level for the current Claude Code session without editing `models.json`.  The override is stored in `.anvil/active-model.json` (cwd-scoped) and read by Anvil's model resolver as layer 2 — below CLI flags but above ENV and all config layers.

## Show current resolution

```
/model
```

Prints the active session override (if any) and the fully-resolved model for this project.

## Set a session override

```
/model balanced
/model best --effort xhigh
/model cheap                     # provider-neutral alias → cheapest model
```

**Arguments**

| Argument | Description |
|---|---|
| `<model-id>` | Provider-neutral alias (`cheap`, `balanced`, `best`) — **recommended**. Anthropic-shorthand (`haiku`, `sonnet`, `opus`) is also accepted. Full provider IDs (e.g. the literal id printed by `anvil models show`) are accepted as a footnote escape hatch. |
| `--effort <level>` | Optional: `low`, `medium`, `high`, `xhigh`, `max` |

**What it does**

1. Validates the effort level (if provided).
2. Resolves any alias to the canonical model ID.
3. Writes `.anvil/active-model.json`:
   ```json
   { "model": "best", "effort": "xhigh", "set_at": "<ISO timestamp>" }
   ```
4. All subsequent `resolveModel(...)` calls in this session pick up the override at layer 2.

**Notes**

- The file is cwd-scoped — it only affects this project directory.
- To clear the override, delete `.anvil/active-model.json` manually or run `anvil model` (show mode) to confirm it is gone.
- The CLI counterpart is `anvil model [<model>] [--effort <level>]`.
