# Troubleshooting

Common issues and how to fix them.

## "anvil: command not found"

The `anvil` binary is not on your PATH. Anvil is not distributed via npm — install it from source:

```bash
git clone https://github.com/anvil-ai/anvil.git
cd anvil
bun install && bun run build
./install.sh
```

The installer puts `anvil` at `~/.local/bin/anvil`. Ensure `~/.local/bin` is on your PATH. See `docs/installation.md` for details.

## "skill not found: X"

The requested skill could not be resolved. Check available skills:

```bash
anvil skill list --all
```

Common causes: misspelled skill name, the skill is disabled in `models.json`, or a language-specific skill is missing for your project type. Universal skills are always available; language skills require project detection to match.

## "model resolution failed"

The model resolution chain could not find a valid model. Inspect your configuration:

```bash
anvil models list
anvil doctor
```

Check `.anvil/models.json` for syntax errors or invalid model names. `anvil models list` shows the active preset and all assignments; `anvil doctor` flags configuration drift.

## "hook failed with exit 2"

A lifecycle hook blocked the operation. Hooks use exit codes to signal intent:

- **Exit 0** -- success, continue.
- **Exit 1** -- advisory warning, operation continues but a warning is logged.
- **Exit 2** -- blocking failure, operation is aborted.

Read the hook's error message for specifics. Check the hook source in `.claude/hooks/` or `.opencode/hooks/`. Run `anvil doctor` to verify hook health.

## Tests failing after install

Run diagnostics first:

```bash
anvil doctor
```

Verify your Node.js version is 20 or later (`node --version`). If doctor reports no issues, the test failures are likely in your project code, not Anvil. Check the test output for specific file:line references.

## TUI not rendering

The interactive installer requires a terminal that supports ANSI escape codes. If the TUI displays garbled output or does not render:

- Verify your terminal supports ANSI (most modern terminals do).
- Try a different terminal emulator.
- Bypass the TUI entirely with `--yes` for non-interactive mode:

```bash
anvil init --yes --preset balanced --target both
```

## Statusline not showing in Claude Code

The Claude Code status line requires explicit opt-in during initialization. Verify that `--statusline` was passed during `anvil init`, or check `.claude/settings.local.json` for the statusline configuration entry. Re-run init with the flag to enable it:

```bash
anvil init --yes --statusline
```

## ".claude-plugin/ manifest missing"

The Claude Code adapter manifest is missing. This usually means `anvil init` was not run, or the `.claude-plugin/` directory was deleted. Re-run initialization:

```bash
anvil init --yes --target claude-code
```

This regenerates the `.claude-plugin/` layout and all adapter files without touching your existing configuration. (The legacy v1 single-file `plugin.json` schema was retired — see `docs/installation.md` § Migrating from v1.)
