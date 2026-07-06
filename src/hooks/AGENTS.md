# src/hooks/ — AI Developer Notes

Layer 2. Hook system.

## Files

- `dispatcher.ts` — routes lifecycle events to registered handlers. Sequential dispatch, worst-exit-code-wins.
- `handlers/*.ts` — one file per hook type. Each exports a named handler function matching `HookHandler` signature.
- `exit-codes.ts` — semantics: `0` = success/continue, `1` = non-blocking warn, `2` = blocking.
- `load-all.ts` — registers all 28 default handlers and applies profile/disabled logic.

## Hook Kinds (21)

| Kind | Phase | Default |
|------|-------|---------|
| session-start | lifecycle | enabled |
| session-end | lifecycle | disabled |
| user-prompt-submit | lifecycle | enabled |
| pre-tool-use | lifecycle | enabled |
| post-tool-use | advisory | disabled |
| pre-compact | compaction | disabled |
| notification | lifecycle | disabled |
| stop | lifecycle | disabled |
| subagent-stop | lifecycle | disabled |
| pre-commit | git | enabled |
| post-edit | editor | enabled |
| pre-push | git | enabled |
| on-error | lifecycle | enabled |
| on-pr-open | git | enabled |
| post-test-run | advisory | disabled |
| context-monitor | advisory | disabled |
| prompt-guard | protective | disabled |
| phase-boundary | advisory | disabled |
| read-guard | protective | disabled |
| workflow-guard | protective | disabled |
| on-large-output | advisory | disabled |

## Hook Profiles

Set `ANVIL_HOOK_PROFILE` env var to override `config.disabled.hooks`:

| Profile | Behavior |
|---------|----------|
| `minimal` | Only security hooks: pre-commit, pre-push, prompt-guard, read-guard, workflow-guard |
| `standard` | Default — respects `config.disabled.hooks` |
| `strict` | All 21 hooks enabled |

## HookResult — two output channels (Plan 31 B1)

`HookResult` carries two distinct output channels:

| Field | Channel | Audience | Mechanism |
|---|---|---|---|
| `message` | User-visible | Terminal / transcript | Written to stdout by the entrypoint |
| `systemInsert` | Model-visible | The model's reasoning context | Adapter-translated; CC uses `hookSpecificOutput.additionalContext` (10KB cap); OpenCode uses `transform()` prepend + `~/.anvil/projects/<name>/active-routing.json` |

Rules:
- `message` is for human-readable status. Set it for soft banners, warnings, or debug output.
- `systemInsert` is for routing directives the model must act on. Only set for high-confidence directive-class decisions; leave undefined for vague/fallback prompts.
- Both can be set at the same time — the entrypoint handles each independently.
- `systemInsert` is **never** written to stdout directly. Use the `message` field for terminal output.

## Dispatcher — timing instrumentation and timeout safeguard (v0.9.2)

`dispatcher.ts` wraps every handler invocation with `performance.now()` and logs
durations to `~/.anvil/logs/hook-timings.jsonl` (rolling, keep last 7 days). Any
handler that exceeds 30 seconds is aborted with a stderr warning and returns a
safe `{exitCode: 0}` result. The `Hook latency budget` doctor row surfaces any
handler that exceeded 5 s (warn) or 30 s (fail) in the log.

`UserPromptSubmit` validation failures are also captured to
`~/.anvil/logs/hook-validation-failures.json` (input/output captured on failure).
The `Hook output validation` doctor row counts failures in the last 24 hours.

## Rules

- Each handler is a pure async function: `(ctx: HookContext) => Promise<HookResult>`.
- Handlers are compiled to CommonJS (`.cjs`) at install time so they can run without the Anvil source tree present.
- A failing handler must still return a structured `HookResult`; never throw to the dispatcher.
- When adding a hook: add to `HookKind` enum in `types.ts`, create handler in `handlers/`, register in `load-all.ts` DEFAULTS array, add to `disabled.hooks` in `defaults.ts` if advisory.
