# src/adapters/ — AI Developer Notes

Layer 5. Platform-specific manifest generators.

## Files

- `claude-code/generate.ts` — writes `.claude-plugin/plugin.json`, `skills/`, `agents/`, `hooks/`, `commands/`, `models.json` (all at plugin root).
- `claude-code/manifest.ts` — builds `marketplace.json`.
- `opencode/generate.ts` — writes `.opencode/opencode.json`, `.opencode/skills/`, `.opencode/hooks/`, `.opencode/models.json`.
- `opencode/manifest.ts` — OpenCode-specific manifest shape.

## Rules

- Adapters are **leaves**. They consume the unified config + skills/hooks/agents and emit platform files.
- Never reach into `commands/`, `tui/`, or another adapter.
- All writes go through the `installer/` layer — adapters produce an in-memory `GeneratedFiles` structure; they don't touch disk.
- Adding a platform: copy the existing adapter, rename, adjust manifest shape.
