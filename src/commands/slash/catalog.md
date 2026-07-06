---
name: catalog
description: Discover, fetch, and promote extensions from remote catalogs
user-invocable: true
experimental: true
---

# /catalog — External catalog discovery and promotion

Browse, fetch, and promote extensions from trusted community catalogs.
All network I/O is explicit — `search` and `list` work offline, only `refresh` and `fetch` hit the network.

## Subcommands

| Subcommand | Description |
|---|---|
| `list-sources` | Show configured catalog sources |
| `refresh` | Re-fetch catalog indices from sources |
| `search <query>` | Full-text search across cached indices |
| `list` | List all cached entries grouped by source |
| `show <source>:<slug>` | Show a single entry's metadata and validation status |
| `fetch <source>:<slug>` | Download a catalog entry into quarantine |
| `status` | Show all quarantined entries and their validation results |
| `promote <quarantine-id>` | Run validators and promote to `~/.anvil/extensions/` |
| `drop <quarantine-id>` | Remove a quarantined entry without promoting |

## Workflow

```bash
# 1. Refresh the index (hits network)
anvil catalog refresh

# 2. Browse or search
anvil catalog list
anvil catalog search code-reviewer

# 3. Fetch into quarantine (hits network)
anvil catalog fetch wshobson:code-reviewer

# 4. Review quarantine status
anvil catalog status

# 5. Promote after review (runs validators, no network)
anvil catalog promote <quarantine-id>

# Or drop without promoting
anvil catalog drop <quarantine-id>
```

## Flags (shared)

| Flag | Description |
|---|---|
| `--json` | Emit machine-readable JSON output |
| `--source <id>` | (refresh, search, list) Restrict to a single source |
| `--accept-warnings` | (promote) Promote even if warn-severity validators failed |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Invalid input (bad format, unknown source/slug) |
| 2 | Network failure |
| 3 | Validation blocked (promote with block-severity fail) |
| 4 | Offline (ANVIL_OFFLINE=1) when network required |
| 5 | Duplicate quarantine entry |

## Equivalent CLI

```bash
anvil catalog list-sources
anvil catalog refresh [--source <id>]
anvil catalog search <query> [--source <id>] [--kind extension|preset|profile]
anvil catalog list [--source <id>]
anvil catalog show <source>:<slug>
anvil catalog fetch <source>:<slug>
anvil catalog status
anvil catalog promote <quarantine-id> [--accept-warnings]
anvil catalog drop <quarantine-id>
```
