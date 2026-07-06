# src/opencode-plugin/ — AI Developer Notes

## Layer

**Layer 5** — parallel leaf to `src/adapters/`. May import from layers 0–4.
Must NOT import from `src/tui/` (6) or `src/installer/` (7).

## What lives here

This is the compiled OpenCode plugin. At build time esbuild bundles
`src/opencode-plugin/index.ts` → `dist/opencode-plugin/index.js`, which is
then copied to `~/.anvil/plugins/opencode/index.js` by `anvil init --target opencode`.

| Subfolder | Responsibility |
|---|---|
| `index.ts` | Plugin entry point; registers the four OpenCode lifecycle handlers. |
| `agents/` | Agent loader, dispatch, transform, and telemetry. |
| `hooks/` | Hook dispatcher (spawn + error policy), payload builders, discovery, map. |

## Lifecycle handlers registered

| Handler | HookKind(s) | Blocking? |
|---|---|---|
| `config` | `session-start` | No |
| `tool.execute.before` | `pre-tool-use` | Yes (exitCode 2 → OcHookBlockedError) |
| `tool.execute.after` | `post-tool-use` | No |
| `experimental.chat.messages.transform` | (transform pipeline) | No |

## Key invariants

- `buildSafeEnv()` (payload.ts) MUST be the only source of env forwarded to
  spawned hooks. Never pass `process.env` directly to `spawn()`.
- Hook dispatch within a kind runs in parallel (`Promise.all`); cross-kind
  ordering stays serial.
- The plugin is a leaf — it never writes back to the parent process state.
