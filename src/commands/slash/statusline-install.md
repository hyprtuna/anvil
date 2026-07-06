---
name: statusline-install
description: Wire the Anvil statusline into Claude Code settings.json (global or project scope)
argument-hint: "[--scope global|project] [--mode anvil|shell-script] [--force]"
user-invocable: false
---

# /statusline-install — Wire the Anvil statusline

Use `/statusline-install` to merge the `statusLine` block into your Claude Code `settings.json`.

## Scope options

| Flag | Target file |
|---|---|
| `--scope project` (default) | `<cwd>/.claude/settings.json` |
| `--scope global` | `~/.claude/settings.json` |

## Mode options

| Flag | What it does |
|---|---|
| `--mode anvil` (default) | Wires `command: <anvilBin> statusline` (TypeScript renderer) |
| `--mode shell-script` | Copies `templates/statusline.sh` into the scope directory and wires `command: bash <path>/statusline-command.sh` |

## Force flag

Without `--force`, the command skips the target if the current `statusLine.command` is a custom (non-anvil) value, and emits a warning. Add `--force` to overwrite.

## Idempotency

Running the same command twice produces no diff — the block is only written when it differs.

## Examples

```
/statusline-install
/statusline-install --scope global
/statusline-install --scope global --mode shell-script
/statusline-install --scope project --mode anvil --force
```

## CLI counterpart

```
anvil statusline install [--scope global|project] [--mode anvil|shell-script] [--force]
```

This slash command is a direct alias for the CLI command above.

## Notes

- `--scope global` is the recommended way to wire Anvil's statusline when you have a pre-existing `~/.claude/settings.json` with a custom `statusLine.command`.
- `--mode shell-script` is for users who prefer an external bash script over the TS renderer. The copied script (`templates/statusline.sh`) is the truecolor-RGB-gradient version (v0.9.0+).
- `anvil doctor` surfaces a `warn` row when `statusLine.command` in either scope points to a non-anvil script, with a migration hint.
