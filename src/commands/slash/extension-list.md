---
name: extension-list
description: List all installed Anvil extensions
user-invocable: true
---

# /extension-list — List installed extensions

Show all extensions currently installed in `~/.anvil/extensions/`.

## Usage

```
/extension-list [--json] [--verbose]
```

## Flags

| Flag | Description |
|---|---|
| `--json` | Emit the full Registry JSON object |
| `--verbose` | Show source path, install date, and manifest schema_version in addition to the default columns |

## Output columns (human mode)

| Column | Description |
|---|---|
| NAME | Extension slug |
| VERSION | Installed version (semver) |
| KIND | Extension kind (`extension`, `preset`, or `profile`) |
| INSTALLED | Installation date (YYYY-MM-DD) |

In verbose mode, adds SOURCE and SCHEMA_VERSION columns.

An empty registry is not an error — exits 0 with a friendly message.

## Equivalent CLI

```bash
anvil extension list
anvil extension list --json
anvil extension list --verbose
```
