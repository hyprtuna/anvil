# Hook Authoring Guide

Hooks are TypeScript handlers that run at lifecycle events. Anvil ships 21 `HookKind` values; the full list and default-enabled status are in the generated table below. The complete schema lives in `src/core/types.ts`.

> **Cross-walk:** Anvil `HookKind` values map to Claude Code's hook-event vocabulary at manifest generation time. CC has 30 events and 5 handler types (`command`, `stdio`, `sse`, `function`, `api`). Anvil wires all handlers as `command` type. The `if:` permission rule pre-filters invocations at the CC manifest level — see the generated section for details.

## HookHandler signature

Every handler must match the `HookHandler` type from `src/core/types.ts`:

```typescript
import type { HookContext, HookResult } from '../../core/types.js'

export const myKindHandler = async (ctx: HookContext): Promise<HookResult> => {
  // ctx.kind     — HookKind enum value for this event
  // ctx.cwd      — current working directory (absolute)
  // ctx.config   — resolved ModelsConfig (full models.json object)
  // ctx.env      — process environment as Record<string, string>
  // ctx.payload  — event-specific data (see per-kind payload table below)

  return {
    exitCode: 0,           // 0=SUCCESS, 1=WARN, 2=BLOCK
    message: 'Optional user-visible text (written to terminal)',
    // systemInsert: 'Optional model-visible directive (never written to stdout)',
  }
}
```

`HookResult` uses `.strict()` — extra fields are rejected at parse time. The old `output` field (pre-v0.9) is gone; use `message` for user-visible text and `systemInsert` for model-visible directives.

## Registering a new hook

1. Create `src/hooks/handlers/<kind>.ts` exporting a `HookHandler`-typed function.
2. Open `src/hooks/load-all.ts` and add an entry to the `DEFAULTS` array:

```typescript
import { myKindHandler } from './handlers/my-kind.js'

// Inside the DEFAULTS array:
{ name: 'my-kind', kind: 'my-kind', handler: myKindHandler }
```

3. If the hook is advisory (not security-critical), add its kind to `disabled.hooks` in `src/core/config/defaults.ts`.
4. Add a unit test in `tests/unit/hooks/handlers/my-kind.test.ts`.
5. Run `bun test` to verify.

## Hook output at runtime

Compiled hook scripts live in `hooks/` as `.cjs` files. The adapters copy them to `.claude-plugin/hooks/<kind>.cjs` (Claude Code) or `.opencode/hooks/<kind>.cjs` (OpenCode). Build with `npm run build`.

<!-- gen:start — managed by scripts/generate-authoring-md.ts; do not edit between markers -->

## All 21 HookKind values

The following table is generated from `src/core/types.ts` `HookKind` enum (21 values).

| Kind | Phase | Default | Description |
|---|---|---|---|
| `session-start` | lifecycle | enabled | Claude Code session begins |
| `session-end` | lifecycle | disabled | Session terminates normally |
| `user-prompt-submit` | lifecycle | enabled | User submits a prompt before model sees it |
| `pre-tool-use` | lifecycle | enabled | Before any tool invocation (can block) |
| `post-tool-use` | advisory | disabled | After a tool returns its result |
| `pre-compact` | compaction | disabled | Before context compaction fires |
| `notification` | lifecycle | disabled | Claude emits a notification event |
| `stop` | lifecycle | disabled | Top-level conversation stop |
| `subagent-stop` | lifecycle | disabled | A spawned subagent finishes |
| `pre-commit` | git | enabled | Before git commit executes |
| `post-edit` | editor | enabled | After Edit/Write/MultiEdit completes |
| `pre-push` | git | enabled | Before git push executes |
| `on-error` | lifecycle | enabled | A tool or handler returned an error |
| `on-pr-open` | git | enabled | A pull request is opened or updated |
| `post-test-run` | advisory | disabled | After a test runner completes |
| `context-monitor` | advisory | disabled | Monitors context token usage |
| `prompt-guard` | protective | disabled | Guards against harmful or off-policy prompts |
| `phase-boundary` | advisory | disabled | Workflow phase transition detected |
| `read-guard` | protective | disabled | Guards sensitive file reads |
| `workflow-guard` | protective | disabled | Enforces workflow step sequencing |
| `on-large-output` | advisory | disabled | Tool result exceeds compression.threshold_words |

> **Anvil HookKind vs CC HookEvent:** HookKind is Anvil's internal taxonomy. Claude Code maps each kind to a CC hook event at manifest generation time (see `src/adapters/claude-code/manifest.ts`). The CC vocabulary has 30 events and 5 handler types (`command`, `function`, `stdio`, `sse`, `api`) — Anvil's adapter currently wires handlers as `command` type.

## HookContext fields

Every handler receives a `HookContext` object. The table below is generated from the `HookContext` Zod schema.

| Field | Type | Description |
|---|---|---|
| `kind` | see schema | The `HookKind` enum value for this event |
| `cwd` | see schema | Absolute path to the current working directory |
| `config` | see schema | Resolved `ModelsConfig` — full models.json config object |
| `env` | see schema | Process environment variables as `Record<string, string>` |
| `payload` | see schema | Event-specific data; shape varies by kind (see per-kind notes below) |
| `profile` | see schema | active profile name resolved by the dispatcher for handlers that declare a `HookHandlerProfileManifest`; undefined for legacy handlers |

### Per-kind payload shapes

| HookKind | payload content |
|---|---|
| `pre-tool-use` | `{ tool_name, tool_input }` |
| `post-tool-use` | `{ tool_name, tool_input, tool_response }` |
| `post-edit` | `{ tool_name: "Edit"\|"Write"\|"MultiEdit", tool_input: { file_path, ... } }` — see `src/hooks/handlers/post-edit-accumulator/payload.ts` |
| `on-large-output` | `LargeOutputPayload` — `{ toolName, toolResult, words, tokens, branch, cwd }` |
| `notification` | `{ message, level }` |
| `on-error` | `{ error_code, error_message, tool_name? }` |
| All others | `undefined` or event-specific object |

## HookResult fields

The table below is generated from the `HookResult` Zod schema. `HookResult` uses `.strict()` — no extra fields are accepted.

| Field | Type | Description |
|---|---|---|
| `exitCode` | `0 \| 1 \| 2` | `0` = success/continue, `1` = non-blocking warn, `2` = blocking abort |
| `message` | `string?` | User-visible text written to the terminal/transcript by the entrypoint |
| `systemInsert` | `string?` | Model-visible directive injected via CC `additionalContext` (10 KB cap) or OC `transform()` prepend; never written to stdout |
| `context` | `Record<string, unknown>?` | Arbitrary key-value bag passed to subsequent handlers in the same dispatch |

### Exit code semantics

| Code | Meaning | Dispatcher effect |
|---|---|---|
| `0` | SUCCESS | Continue normally |
| `1` | WARN | Log warning, continue |
| `2` | BLOCK | Abort the triggering action; show `message` to user |

The dispatcher uses **worst-wins** aggregation: if any registered handler for a kind returns `2`, the aggregate is `2`.

## Hook profiles

Set `ANVIL_HOOK_PROFILE` to override `config.disabled.hooks` at runtime:

| Profile | Behaviour |
|---|---|
| `minimal` | Security only: `pre-commit`, `pre-push`, `prompt-guard`, `read-guard`, `workflow-guard` |
| `standard` | Default — respects `config.disabled.hooks` from models.json |
| `strict` | All 21 hook kinds enabled |

## `if:` permission rule (Claude Code adapter)

CC supports an `if:` permission rule on each hook entry in the plugin manifest, which pre-filters invocations against the CC permission context (allowlists/denylists, tool-name globs, etc.) before the handler runs. In Anvil, `if:` is wired at manifest-generation time via the `h.ifRules` field on each hook registration — see `src/adapters/claude-code/manifest.ts:37` for how the value is serialized into the CC manifest, and `src/skills/load-all.ts` for where individual hook `register()` calls supply the rule. Skill frontmatter does **not** declare `if:` directly; the rule is adapter-managed at the hook layer.

When authoring a new hook, set `ifRules` if the hook should only fire for a specific tool subset or permission context. Omit it to have the hook always evaluated by the dispatcher.

## Disabling individual hooks

In `.anvil/models.json`:

```json
{
  "disabled": {
    "hooks": ["post-tool-use", "context-monitor"]
  }
}
```

Values must be valid `HookKind` strings. Stale tokens (removed kinds) now fail Zod validation at config load time.

## Handler timeout

Each handler has a hard 30-second abort timeout (configurable via `hooks.timeout_seconds` in models.json). Aborted handlers return a safe `{exitCode: 0}`. The `anvil doctor` "Hook latency budget" row surfaces handlers that exceeded 5 s (warn) or 30 s (fail) from `~/.anvil/logs/hook-timings.jsonl`.

<!-- gen:end -->

