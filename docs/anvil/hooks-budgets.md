# Hook Context Budgets

Anvil enforces character budgets on hook `systemInsert` outputs to prevent context flooding.

## SessionStart aggregate budget

When a session starts, multiple hook handlers may emit `systemInsert` content (notepad context, routing rules, rule meta-skills, etc.). Without a cap, this content competes with the user's actual work for context space.

### Default budget

`SESSION_START_BUDGET_CHARS = 6000` characters (~1500 tokens at 4 chars/token, matching the OmO default).

### How aggregation works

1. All enabled `session-start` handlers run in priority order (highest priority first).
2. Each handler that returns `systemInsert` contributes a fragment.
3. The aggregator iterates fragments in priority order, concatenating with `\n\n` separators.
4. When the next fragment would exceed the budget, it is dropped.
5. If any fragment was dropped, `[truncated to fit N char budget]` is appended so the model knows context was elided.
6. The aggregated result is returned as `DispatchResult.sessionStartContext`.

### Configuration

Add to `~/.anvil/models.json`:

```json
{
  "hooks": {
    "session_start": {
      "budget_chars": 6000
    }
  }
}
```

Set `budget_chars: 0` to suppress all SessionStart context injection.

### Telemetry

Overruns are logged to `~/.anvil/logs/session-start-overruns.jsonl`:

```json
{"ts":"2026-05-10T12:00:00.000Z","budgetChars":6000,"usedChars":4002,"includedCount":2,"droppedCount":1}
```

The `anvil doctor` "SessionStart context budget" row reads this log and reports the tail-truncation percentage over the last 10 recorded overruns. Status is `warn` when any truncation has occurred, `skip` when no log exists yet.

### Trade-offs

- **Budget too small:** high-priority context (e.g. notepad recent-context) crowds out lower-priority context (rule meta-skills). The truncation notice surfaces this.
- **Budget too large:** increased context on every session start; models with small context windows may see degraded performance.
- **Budget = 0:** fastest session start, no context injection at all. Useful in environments where session-start context is never needed (e.g. CI-only runs).

The 6000-char default mirrors OmO's `SESSION_START_CONTEXT_BUDGET` and represents roughly 10× the notepad context cap (500 tokens) — enough room for the notepad plus rule banners without crowding the user's working context.
