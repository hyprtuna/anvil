# Anvil

> Language-aware, role-aware skill system for Claude Code and OpenCode — hybrid CLI and plugin.

**Status:** v0.18.0. Skill system, layered model-and-effort routing, hook runtime, orchestration agents, and OpenCode plugin parity all shipped.

## What it does

Anvil ships a complete skill system (79 universal skills + 54 language skills across 19 stacks) with intelligent skill selection, layered model-and-effort routing, 30 lifecycle hooks, and 18 orchestration agents. One source of truth, materialized to both Claude Code (`.claude-plugin/`) and OpenCode (`.opencode/`). (Canonical counts: `anvil doctor --catalog`.)

## Installation

### Prerequisites

Anvil requires **Bun** (preferred) or **Node ≥ 20**.

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash
```

### Clone and install

```bash
git clone https://github.com/hyprtuna/anvil.git
cd anvil
bun install && bun run build
```

### Run the installer from your project directory

```bash
# Default: user-scope Claude Code + OpenCode (no CLI on PATH)
./install.sh

# All four targets (cc-user, cc-project, oc-user, oc-project)
./install.sh --all

# Also put `anvil` on PATH at ~/.local/bin/anvil
./install.sh --cli
```

### Uninstall

```bash
./uninstall.sh --all --purge
```

### Verify

```bash
# If you used --cli:
anvil doctor

# Without --cli:
node ~/.anvil/bin/install.cjs doctor
```

## What's included

- **79 universal skills** — planning, development, test-driven-development, code-review, debugging, git-workflow, ultra-worker, orchestration, and more
- **54 language skills across 19 stacks** — JavaScript, TypeScript, React, Next.js, PHP, Laravel, Python, Django, FastAPI, Go, Rust, Java, Spring, Kotlin, Ruby, Rails, C#, Swift, C++
- **18 agents** — orchestrator, ultra-worker, code-explorer, code-architect, code-reviewer, doc-verifier, silent-failure-hunter, plan-verifier, and more
- **30 lifecycle hooks** — session-start, session-end, user-prompt-submit, pre/post-tool-use, pre-commit, post-edit, pre-push, on-error, on-pr-open, pre-compact, and more
- **4 model presets** — balanced (recommended), cost-optimised, max-quality, speed-first

## CLI reference

```bash
anvil doctor          # verify installation
anvil models list     # show every skill's resolved model
anvil skill list      # list installed skills
anvil plan <goal>     # invoke planning
anvil review [target] # invoke code-review
anvil ultra <task>    # invoke autonomous ultra-worker
```

See `docs/installation.md` for the full command reference.

## Docs

- **Design spec:** [`.anvil/specs/anvil-design.md`](.anvil/specs/anvil-design.md)
- **Getting started:** [`docs/getting-started.md`](docs/getting-started.md)
- **Architecture:** [`.anvil/specs/anvil-design.md`](.anvil/specs/anvil-design.md)
- **Skill authoring:** [`docs/skill-authoring.md`](docs/skill-authoring.md)
- **Hook authoring:** [`docs/hook-authoring.md`](docs/hook-authoring.md)
- **Installation guide:** [`docs/installation.md`](docs/installation.md)

## Contributing

This is an AI-developed project. See [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md) at the root and in each folder for conventions.

## License

MIT
