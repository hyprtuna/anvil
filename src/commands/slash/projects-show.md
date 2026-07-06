---
name: projects-show
description: Show full preferences for the current project (or a specific cwd)
user-invocable: true
---

# /projects-show — Show project preferences

Display the full per-project preferences for the current working directory, including per-kind artifact settings (location + format for each kind such as `review`, `plan`, etc.).

## Usage

```
/projects-show
/projects-show [<cwd>]
```

Or with JSON output:

```
/projects-show --json
/projects-show /path/to/project --json
```

## Equivalent CLI

```bash
anvil projects show
anvil projects show /path/to/project
anvil projects show --json
anvil projects show /path/to/project --json
```

## Arguments

| Argument | Description |
|---|---|
| `[<cwd>]` | Optional: absolute path to a project directory. Defaults to the current working directory. |

## Output

When preferences exist, shows:
- Project name (auto-derived key)
- Full cwd path and first-seen date
- Default location + format (if set)
- Per-kind table: KIND · LOCATION · FORMAT

When no preferences have been saved for the project: prints `No preferences for this project yet.`

JSON mode emits `{ projectName: string, preferences: ProjectPreferences | null }`.
