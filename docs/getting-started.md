# Getting Started with Anvil

This guide walks you from zero to running Anvil inside Claude Code or OpenCode
in under five minutes.

## 1. Install the runtime

Anvil is Bun-first. Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

If you can't install Bun, Node ≥20 works as a documented fallback. Anvil
detects the runtime automatically.

## 2. Clone Anvil

```bash
git clone https://github.com/anvil-ai/anvil.git
cd anvil
bun install && bun run build
```

## 3. Install into your editor

From inside the project you want Anvil to serve, run the installer. With no
flags it opens an interactive TUI that asks which editor scopes to wire and
whether to put the `anvil` CLI on your PATH:

```bash
/path/to/anvil/install.sh
```

Or skip the TUI with flags:

```bash
# Default scopes (cc-user, oc-user); no CLI on PATH
/path/to/anvil/install.sh --claude-code-user --opencode-user

# All four targets (cc-user, cc-project, oc-user, oc-project)
/path/to/anvil/install.sh --all

# Also symlink `anvil` to ~/.local/bin/anvil
/path/to/anvil/install.sh --all --cli
```

What the installer does:

1. Detects Bun or Node.
2. Copies the Anvil runtime to `~/.anvil/runtime/` (the runtime mirror — Anvil
   survives source-tree moves and worktree deletion).
3. Wires skills, agents, hooks, and commands into Claude Code and/or OpenCode
   based on the selected scopes.
4. Prints a structured summary of every action — scopes wired, files written,
   CLI symlink status.

## 4. Verify

```bash
# If you installed the CLI symlink:
anvil doctor

# Without the symlink, invoke the driver directly:
~/.anvil/bin/anvil.cjs doctor
```

Expected: all checks green. If anything is red, follow the fix command the
doctor prints, or run `anvil doctor --fix`.

You can also dry-run prompt routing from the CLI to confirm the plugin picks
the right agent or skill for a given prompt:

```bash
anvil route "refactor the auth middleware"
anvil route "explain how this function works" --json
```

## 5. Uninstall

Interactive, with no flags:

```bash
/path/to/anvil/uninstall.sh
```

Or non-interactive:

```bash
/path/to/anvil/uninstall.sh --all --purge
```

`--all` removes all four targets; `--purge` deletes `~/.anvil/` entirely.

## 6. Try it inside Claude Code

Open the repo in Claude Code. Type `/doctor` — the slash command should be
discovered. Then try:

- `/plan add-auth` — invokes the planning skill
- `/review` — invokes the code-reviewer agent
- `/debug` — invokes the debugger skill

If Claude Code doesn't see the commands, see **Troubleshooting** below.

## 7. Try it inside OpenCode

Open the repo in OpenCode. Check `.opencode/agents.json` exists and lists the
Anvil agents. Then prompt: `@code-reviewer review this diff`.

## Troubleshooting

**"Claude Code doesn't see any of the skills."**
Open `.claude/settings.json` in your project. Verify the skills, agents,
commands, and hooks symlinks were created. Re-run `./install.sh --claude-code-project`
to repair.

**"`anvil` is not found after install."**
Either you didn't pass `--cli`, or `~/.local/bin` isn't on your `PATH`.
Add it:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Or invoke the driver directly:

```bash
~/.anvil/bin/anvil.cjs doctor
```

**"Hooks don't fire."**
Check the hook files are executable: `ls -l ~/.anvil/plugins/claude-code/hooks/*.cjs`
should show `x`. If not: `chmod +x ~/.anvil/plugins/claude-code/hooks/*.cjs`.

**"Bun command not found."**
Either install Bun (`curl -fsSL https://bun.sh/install | bash`) or ensure
Node ≥20 is available — the installer falls back automatically.

**Still stuck?**
See [troubleshooting.md](./troubleshooting.md) for the longer list, or open an
issue with the output of `anvil doctor --verbose`.

## 8. Statusline

Anvil ships a rich truecolor statusline for Claude Code. The default template
(`rich`) renders a 20-block RGB-gradient context bar with emoji scaling,
Week's Usage windows, code velocity, branch, and model + effort segments.

To switch back to the simpler v0.9.1 bar:

```bash
anvil statusline template simple
```

To install the statusline globally for all projects:

```bash
anvil statusline install --scope global
```

See the **Statusline** sections in [cheatsheet.md](./cheatsheet.md) for the
full command reference.

## Next steps

- Read [features.md](./features.md) to see what's included.
- Read [cheatsheet.md](./cheatsheet.md) for the one-page command reference.
- Read [workflow-guide.md](./workflow-guide.md) for the 7-phase development loop.
