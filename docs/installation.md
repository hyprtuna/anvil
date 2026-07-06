# Installation Guide

## Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js ≥20
- Git

## Quick start

Clone the repo and run the installer. Launched with no flags, `install.sh`
drops into an interactive TUI and asks which scopes to wire and whether to
symlink the `anvil` CLI onto your PATH:

```bash
git clone https://github.com/your-org/anvil.git ~/.anvil-src
cd /your/project
~/.anvil-src/install.sh
```

After install, `~/.anvil/` holds the canonical runtime and the selected editor
scopes get their plugin wiring. To skip the TUI, pass any flag — the installer
runs non-interactively and prints a structured summary of every action.

## Install targets

By default `install.sh` wires `--claude-code-user` and `--opencode-user`. Pass explicit flags to control what gets wired:

| Flag | What it wires |
|---|---|
| `--claude-code-user` | Claude Code user-level plugin (`~/.claude/`) |
| `--claude-code-project` | Claude Code project hooks (`.claude/settings.json` in CWD) |
| `--opencode-user` | OpenCode user config (`~/.config/opencode/opencode.json`); builds and installs the plugin at `~/.anvil/plugins/opencode/index.js` |
| `--opencode-project` | OpenCode project config (`.opencode/opencode.json` in CWD); requires `--opencode-user` (or a prior global install) |
| `--all` | All four targets |
| `--none` | Sync `~/.anvil/` only, wire nothing |

### OpenCode plugin topology

Anvil ships a single plugin at `~/.anvil/plugins/opencode/index.js`. Both
user and project OpenCode configs load it via
`"plugin": ["file:///home/<user>/.anvil/plugins/opencode/index.js"]`
(absolute path required; tilde is not expanded by OpenCode — run
`anvil init --target opencode` to have the correct path written automatically).
The plugin is built from `src/opencode-plugin/` during `npm run build` and
copied to the install location by `--opencode-user`. `--opencode-project`
only writes `.opencode/opencode.json` — it does not rebuild the plugin.
See [OpenCode plugin reference](opencode-plugin.md) for handler coverage,
build requirements, and troubleshooting.

Example — wire everything for the current project:

```bash
./install.sh --all
```

## Install the `anvil` CLI

Add `--cli` to create a symlink at `~/.local/bin/anvil`:

```bash
./install.sh --cli                          # low-level driver path
./install.sh --yes --cli                    # friendly init path
anvil init --cli                            # once anvil is on PATH (re-symlink)
```

Make sure `~/.local/bin` is on your `PATH`. The interactive TUI offers the same
choice if you run `install.sh` with no flags.

## Enable the Claude Code status line

`--statusline` wires Anvil's statusline into Claude Code settings so the footer
shows model, effort, session cost, context %, and more:

```bash
./install.sh --yes --statusline
anvil init --statusline
```

The interactive TUI asks before the install preview (default: no).

**Statusline scope and renderer (v0.9.1 / v0.9.2):**

As of v0.9.1, `anvil statusline install` defaults to `--scope global` (writes
to `~/.claude/settings.json`). Pass `--scope project` to scope per-repo.

As of v0.9.2, the default template is `rich` — a truecolor RGB-gradient render
with 20-block context bar, emoji scaling, Week's Usage windows, code velocity,
branch, and model + effort segments side-by-side. To opt back to the simpler
v0.9.1 bar:

```bash
anvil statusline template simple
```

Select the renderer with `--mode`:

```bash
anvil statusline install --scope global --mode anvil        # TS renderer (default)
anvil statusline install --scope global --mode shell-script # copy truecolor bash template
```

## Source options

| Flag | Description |
|---|---|
| *(none)* | Use the repo containing `install.sh` (default) |
| `--from-local <path>` | Use a local Anvil source directory |

> **Note:** `--from-git` and `--from-archive` are not yet available. They will be added in a future release once the safe-pack-extraction test harness is in place.

## Other flags

| Flag | Description |
|---|---|
| `--prefix <dir>` | Install to a custom directory instead of `~/.anvil` |
| `--force` | Bypass v1 residue check and overwrite existing install |
| `--dry-run` | Preview what would be written without making changes |

## Verification

After installing, run the doctor command to verify everything is wired correctly:

```bash
anvil doctor
```

Or without the CLI symlink:

```bash
node ~/.anvil/bin/anvil.cjs doctor
```

## Upgrading

Re-run `install.sh` — the installer is idempotent and only rewrites changed files:

```bash
./install.sh
```

## Uninstalling

With no flags, `uninstall.sh` launches an interactive TUI that lists every
wired scope and asks which to remove:

```bash
./uninstall.sh
```

To skip the TUI, pass flags directly:

```bash
./uninstall.sh --all          # unwire all targets, leave ~/.anvil intact
./uninstall.sh --all --purge  # unwire everything and delete ~/.anvil
```

The same target flags (`--claude-code-user`, `--claude-code-project`, etc.) apply to `uninstall.sh`.

## Migrating from v1

If you have a v1 Anvil install (`.claude-plugin/plugin.json` or `.opencode/opencode.json` with the old schema), the installer will detect it and refuse to proceed. Clean up first:

```bash
./uninstall.sh --all --purge
./install.sh
```

Or pass `--force` to override the check.

## Recovery — when the source repo is moved or deleted

**v0.9.0+**: Anvil mirrors its compiled runtime into `~/.anvil/runtime/` at install time. The user-facing shims at `~/.anvil/bin/anvil.cjs` and `~/.anvil/bin/install.cjs` resolve through this mirror, so they keep working after the install-time source repo is moved, renamed, or deleted (e.g. after a worktree is pruned).

### What is the runtime mirror?

`~/.anvil/runtime/dist/` contains a self-contained copy of the compiled Anvil CLI and installer, bundled by `esbuild` with all npm dependencies inlined. No `node_modules/` directory is required at runtime.

### Recovery if `~/.anvil/runtime/` is missing or corrupt

If `~/.anvil/bin/anvil.cjs` prints:

```
anvil runtime missing at /home/<user>/.anvil/runtime — re-run `~/.anvil/bin/install.cjs` from a valid source checkout to recover.
```

Recover by running `./install.sh` from any valid Anvil source checkout:

```bash
git clone https://github.com/your-org/anvil /tmp/anvil-recover
cd /tmp/anvil-recover
npm install
npm run build
./install.sh
```

This rebuilds the runtime mirror at `~/.anvil/runtime/` and rewrites the shims. After recovery, the source checkout can be deleted — the shims will continue to work.

### Source-tree shims (`./install.sh`, `./uninstall.sh`)

These shell scripts invoke the source-resident `bin/anvil.cjs` directly (not the user-facing shims at `~/.anvil/bin/`). They require a valid source tree and a completed `npm run build`.
