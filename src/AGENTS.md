# src/ — AI Developer Notes

The `src/` tree is organized in layers. Each subfolder is one layer with one responsibility:

| Folder | Layer | Role |
|---|---|---|
| `core/` | 0 | Primitives, types, config, models, registry. No I/O outside the config layer. |
| `intent/` | 1 | Intent detection, routing, and phase management. Pure data (`intents.ts`) + routing kernel (`router.ts`). Peer of `skills/` at layer 1. |
| `skills/` | 1 | Skill loader, selector, chain, runtime. |
| `hooks/` | 2 | Hook dispatcher and lifecycle handlers. |
| `agents/` | 3 | Agent runners (orchestrator, ultra-worker). |
| `commands/` | 4 | CLI command implementations and slash command `.md` definitions. |
| `adapters/` | 5 | Platform-specific manifest generators (claude-code, opencode). |
| `opencode-plugin/` | 5 | Compiled OpenCode plugin (esbuild bundle); lifecycle handlers for config, tool.execute.before/after, and message transform. Parallel leaf to `adapters/`. |
| `tui/` | 6 | @clack/prompts TUI installer. |
| `installer/` | 7 | Install/uninstall execution with idempotency and rollback. |

## Rules

- Lower-numbered layers **cannot** import from higher-numbered layers.
- `core/` has no side effects outside config loading.
- `adapters/` are leaves — they never import from `commands/` or `tui/`.
- Every file has one responsibility. If a file grows past ~200 lines, consider splitting.
