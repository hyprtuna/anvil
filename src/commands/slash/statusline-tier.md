---
name: statusline-tier
description: Read or set the active statusline display tier (minimal | default | maximal)
argument-hint: "[<tier>] [--json]"
user-invocable: false
---

# /statusline-tier — Statusline tier management

Use `/statusline-tier` to read or change the active statusline display tier without hand-editing `~/.anvil/models.json`.

The tier controls how much information the status bar shows in Claude Code. Three tiers are available:

| Tier | What it shows |
|---|---|
| `minimal` | Branch name + dirty indicator only |
| `default` | Branch, active skill, token count, context %, 5h + 7d rate-limit windows |
| `maximal` | All of the above plus cost, context depth, and extended diagnostics |

## Read the current tier

```
/statusline-tier
```

Prints the active tier and the source (`user` if set in `~/.anvil/models.json`, `default` otherwise).

```
/statusline-tier --json
```

Machine-readable output: `{ "tier": "default", "source": "default" }`.

## Set a tier

```
/statusline-tier minimal
/statusline-tier default
/statusline-tier maximal
```

Writes `statusline.tier` to `~/.anvil/models.json`, preserving all other fields. The change takes effect immediately on the next statusline render cycle.

## CLI counterpart

```
anvil statusline tier [<tier>] [--json]
```

This slash command is a direct alias for the CLI command above. The same validation rules apply: only `minimal`, `default`, and `maximal` are accepted; any other value exits with code 2 and prints the valid set.

## Notes

- The tier is a global (home-scoped) setting — it affects all projects on this machine.
- To revert to the built-in default, run `anvil statusline tier default`.
- `anvil doctor` shows the active tier in the statusline section.
