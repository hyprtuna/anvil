---
name: projects-list
description: List all tracked projects and their saved preferences
user-invocable: true
---

# /projects-list — List tracked projects

Show all projects that have saved preferences in `~/.anvil/preferences.json`, including their auto-derived name, working directory, first-seen date, and default location/format settings.

## Usage

```
/projects-list
```

Or with JSON output:

```
/projects-list --json
```

## Equivalent CLI

```bash
anvil projects list
anvil projects list --json
```

## Output columns

| Column | Description |
|---|---|
| NAME | Auto-derived project key (git remote → basename → hash suffix on collision) |
| CWD | Full working directory path |
| FIRST_SEEN | Date the first preference was saved for this project |
| DEFAULT_LOCATION | Default artifact location (if set) |
| DEFAULT_FORMAT | Default artifact format — `json`, `markdown`, or `both` (if set) |

When no projects are tracked yet, prints `No projects tracked yet.`

JSON mode emits the full `preferences.json` object (version + projects map).
