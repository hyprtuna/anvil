---
name: extension-uninstall
description: Uninstall an installed Anvil extension by name
user-invocable: true
---

# /extension-uninstall — Uninstall an extension

Remove an installed extension from `~/.anvil/extensions/`. Performs a conservative dependency check: if any other installed extension's `manifest.requires[]` references this extension, the uninstall is blocked unless `--force` is set.

## Usage

```
/extension-uninstall <name> [--force] [--json]
```

## Arguments

| Argument | Description |
|---|---|
| `<name>` | The extension slug to uninstall |

## Flags

| Flag | Description |
|---|---|
| `--force` | Remove even if other extensions depend on this one |
| `--json` | Emit JSON output: `{ status, name, blockers }` |

## JSON output

```json
{ "status": "uninstalled" | "not-found" | "blocked", "name": "...", "blockers": ["..."] }
```

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Successfully uninstalled, or extension was not installed (status `not-found`) |
| 5 | Blocked by dependent extensions (use `--force` to override) |

## Equivalent CLI

```bash
anvil extension uninstall <name>
anvil extension uninstall <name> --force
anvil extension uninstall <name> --json
```
