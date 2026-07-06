# docs/ — Folder Guide

AI-developer instructions for any agent working inside `docs/`. This file is the single source of truth; the sibling `CLAUDE.md` is a stub.

## Purpose

User-facing documentation, the release-policy contract, and the planning-artifact split. `docs/` is the **public-shaped** surface of Anvil's planning system — what survives a `git clone` for a reader trying to understand the project. Internal planning state lives in `.anvil/` instead.

## Layout

| Path | Purpose | Audience |
|---|---|---|
| `docs/getting-started.md` | First-run tutorial | new users |
| `docs/installation.md` | Install paths (Claude Code, OpenCode, source) | new users |
| `docs/cheatsheet.md` | Common commands + env vars | returning users |
| `docs/features.md` | High-level feature index | evaluators |
| `docs/workflow-guide.md` | End-to-end workflows (plan → implement → release) | users + AI agents |
| `docs/skill-authoring.md` | How to write a new skill | contributors |
| `docs/hook-authoring.md` | How to write a new hook | contributors |
| `docs/opencode-plugin.md` | OpenCode adapter notes | contributors |
| `docs/adapter-transcript-policy.md` | Policy: new adapters need acceptance transcripts | contributors + adapter authors |
| `docs/contributor-vs-user.md` | Clarifies contributor-only vs user-facing surfaces; maps common tasks to the right CLI. | contributors |
| `docs/release-policy.md` | **BINDING.** Release composition, semver mapping, ceremony. | maintainers + AI agents drafting releases |
| `docs/troubleshooting.md` | Common failures + fixes | users |
| `docs/roadmap.md` | **Themes only.** Multi-release direction. No flat item lists. | maintainers |
| `docs/anvil/backlog.md` | Single grep target for unscoped work. Flat list, every line carries `source:` provenance. P0–P3, rejected, decision-required all live here. | maintainers + AI agents |
| `docs/anvil/releases/v<x.y.z>.md` | **Released slates only.** `Status: released <ISO-date>`. Historical record. | maintainers + future readers |
| `docs/anvil/releases/README.md` | Index of released versions | readers |
| `docs/anvil/release-workflow.md` | **Release orchestration pipeline.** Pre-flight → branch cut → per-ticket planner/coder loop → two-stage review → ship. Wraps the `dev:release` ceremony with model-tier routing + concurrency rules. | maintainers + AI agents driving a release |
| `docs/anvil/hooks-budgets.md` | Per-hook latency/context budgets | contributors |
| `docs/anvil/README.md` | Index of the anvil-internal docs subtree | readers |

## What does NOT belong here

- **In-flight release plans.** They go in `.anvil/plans/v<x.y.z>.plan.md`. `docs/anvil/releases/` is for released slates only — never create a new file here for unreleased work.
- **Individual tickets.** They go in `.anvil/tickets/ANV-NNNN-<slug>.md`.
- **Raw audit findings.** They go in `.anvil/audits/`.
- **Implementation specs.** They go in `.anvil/specs/features/<slug>/`.
- **Roadmap items at item granularity.** `roadmap.md` is themes-only; items go in `docs/anvil/backlog.md`.

## Hard rules

1. **No duplication across `docs/` and `.anvil/`.** Items move (release ← backlog ← audit). A backlog line that also appears in a plan is a policy violation — delete the backlog line when scoping.
2. **Every backlog and slate line carries `source:` provenance.** Audit ID, plan number, post-mortem, or PR review.
3. **CHANGELOG entries are written at release time, not staged ahead.** The plan in `.anvil/plans/` is the staging area.
4. **Audits don't mutate.** Strike with `~~` + reason rather than deleting; promote findings into `backlog.md` or a plan.

## Release ceremony reference

When a release ships:

1. `npm run dev:release -- <version>` runs the ceremony (bumps `package.json`, rewrites version-bump tests, prepends CHANGELOG). As of v0.15.3 this lives in `scripts/dev/release.ts` — see `docs/contributor-vs-user.md`.
2. **Copy** `.anvil/plans/v<version>.plan.md` → `docs/anvil/releases/v<version>.md`.
3. Flip `Status:` → `released <ISO-date>`.
4. Both files persist: the plan is the implementation snapshot; the slate in `docs/anvil/releases/` is the public/historical record.

See `docs/release-policy.md § Release ceremony` for the full step-by-step.

## When in doubt

If you're about to write a planning file: ask "is the release out yet?" — yes → `docs/anvil/releases/`; no → `.anvil/plans/`.
If you're about to write a research note, design spec, audit, or ticket: it goes in `.anvil/`, not here.
