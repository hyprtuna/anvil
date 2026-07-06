# Anvil Roadmap

> Themes-only, intentionally high-level. For shipped detail see [`CHANGELOG.md`](../CHANGELOG.md). Concrete release planning happens in a separate private workspace.

Anvil is a language-aware, role-aware skill system for Claude Code and OpenCode — a hybrid CLI and plugin. This roadmap tracks direction at the theme level; priorities shift with real usage.

## Shipped foundations

- **Skill system** — universal skills plus per-language stacks, with intelligent skill selection.
- **Model-and-effort routing** — layered resolution with presets (balanced, cost-optimised, max-quality, speed-first).
- **Hook runtime** — lifecycle hooks across session, prompt, tool-use, commit, edit, and compaction events.
- **Orchestration agents** — orchestrator, ultra-worker, code reviewers, explorers, verifiers, and more.
- **Cross-host parity** — one source of truth materialized to both Claude Code (`.claude-plugin/`) and OpenCode (`.opencode/`).
- **Tooling** — installer, `anvil doctor` diagnostics, and the Spec-Driven Development (`/sdd-workflow`) flow.

## Directions under consideration

- Broader language and framework coverage.
- Deeper adapter capability parity across agent hosts.
- Richer routing informed by live model-capability data.
- Expanded verification and review tooling.

Nothing here is a commitment; it's a sketch of where Anvil is heading.
