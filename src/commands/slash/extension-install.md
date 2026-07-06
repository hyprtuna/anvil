---
name: extension-install
description: Install an Anvil extension from a local archive or directory
user-invocable: true
---

# /extension-install — Install an extension

Install an Anvil extension from a local `.tar.gz`, `.tgz`, `.zip` archive or a directory containing `manifest.json`.

## Usage

```
/extension-install <source> [--on-collision <strategy>] [--rename <new-name>] [--yes] [--json]
```

## Arguments

| Argument | Description |
|---|---|
| `<source>` | Path to a local archive (`.tar.gz`/`.tgz`/`.zip`) or directory with `manifest.json` |

## Flags

| Flag | Description |
|---|---|
| `--on-collision <strategy>` | How to handle collisions: `skip`, `abort`, `fail`, `replace`, or `rename` |
| `--rename <new-name>` | Install under a new name (requires `--on-collision=rename`) |
| `--yes` / `-y` | Skip prompts; defaults to `abort` when `--on-collision` is absent |
| `--json` | Emit JSON output: `{ status, name, version, source, collisions }` |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success or skip |
| 1 | Invalid manifest or bad flag combination |
| 2 | Extraction failed |
| 3 | Unresolved collision |
| 4 | Non-interactive context without `--on-collision` |

## Equivalent CLI

```bash
anvil extension install <source>
anvil extension install <source> --on-collision=replace
anvil extension install <source> --on-collision=rename --rename my-new-name
anvil extension install <source> --json
```
