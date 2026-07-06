# Release Policy

The contract for what goes into an Anvil release. Binding for human contributors and AI companions. Goal: every `x.y.z` mixes risk-reduction with new value.

## Composition

When items of that type exist, every release MUST include:

| Category | Floor | Cap |
|---|---|---|
| Technical debt | 1 | 2 |
| Improvements to existing code | 1 | 3 |
| Additions (new skills/agents/hooks/commands) | 1 | 3 |
| Bug fixes | 1 | 3 |
| Docs / DX | 0 | 2 |

Empty categories MUST be justified in the changelog ("no open bugs at cut", "no debt promoted this cycle"). Skipping a category silently is a policy violation.

## Size discipline

- No single item exceeds **40%** of the release diff.
- `z` releases target ≤ 1500 LOC; `y` releases ≤ 4000 LOC. Walk items down, don't push the cap up.

## Priority overrides

These ship outside the composition rule, on their own cadence:

- **Security**: CVEs, secret exposure, sandbox escapes, prompt-injection with real blast radius.
- **Data loss**: anything that destroys user state, config, or installed artifacts.
- **Install/upgrade breakage**: `anvil init` or `anvil doctor` failing on a clean machine.

Override releases bump `z` (or `y` if breaking) and may contain a single item.

### Hardening releases

An **audit-driven hardening release** may exceed the debt and bug caps when:

1. The release is the explicit follow-up to a self-audit pass (i.e., `.anvil/audits/_anvil-self-audit.md` cited in the slate).
2. New feature surface is explicitly out of scope (composition row "feature" omitted with reason).
3. Every line item traces to a P0 finding in the cited audit — not scope creep.

The slate MUST acknowledge each cap exceedance in its composition table (e.g., "debt: 4 — EXCEEDS cap 2 — hardening release") and cite this section. The 40% per-item size limit and the `y` LOC ceiling still apply.

## Semver mapping

| Bump | Trigger |
|---|---|
| `z` patch | Bug fixes, docs, non-breaking improvements, additions that don't change public surface |
| `y` minor | New skills/agents/hooks/commands, schema additions, breaking internal contracts |
| `x` major | Reserved for documented v1.0 surface freeze; not used in 0.x |

Anvil has no backwards-compat shims (solo user, full reinstall expected) — breaking is cheap, but the version still signals intent.

## Changelog requirements

Each release's CHANGELOG.md entry MUST:

1. Group items under the 5 category headers above.
2. State explicitly when a category was empty and why.
3. Cross-reference the plan number under `.anvil/plans/` if one exists.

## Planning-doc lifecycle

Five docs carry release-related state. Each has one job — don't mix them.

| Doc | Role | When updated | What belongs | What does NOT belong |
|---|---|---|---|---|
| `CHANGELOG.md` | Shipped history. Append-only. | At release cut, before tagging. | Per-release entry grouped under the 5 composition headers; explicit "no X this release" lines; cross-ref to plan + audit IDs. | Forward-looking promises, themes, unreleased work. |
| `docs/roadmap.md` | Themes only — multi-release direction. | When a theme is added, completed, or dropped. **Not** when an item ships. | High-level themes (≤1 paragraph each), a pointer to `docs/anvil/releases/`, a pointer to `docs/anvil/backlog.md`. | Flat item lists, version-targeted rows, item-level status, anything that duplicates `backlog.md`. |
| `docs/anvil/releases/v<x.y.z>.md` | Scoped slate for one release. | When an item is scoped *into* a release (move from backlog) or out (push back to backlog). | Composition table, slate items with `source:` provenance, exit criteria. | Items also living in `backlog.md` (move, don't duplicate). |
| `docs/anvil/backlog.md` | Unscoped grep target. | When a new item is identified or an item is descoped. | Flat priority/category-tagged list, every line carries `source:`. | Themes (those go in `roadmap.md`); shipped work (that's in `CHANGELOG.md`). |
| `.anvil/audits/` | Raw findings, frozen at audit time. | Once per audit pass; never edited after. | Per-finding ID, source citation, what/why/effort/proposal. | Active planning state — items move *out* into `backlog.md` or a release slate. |

Hard rules:

- **No duplication across docs.** Items move (release ← backlog ← audit). Roadmap themes never list items by ID.
- **Roadmap is themes-only.** If you find yourself adding a flat item list with priorities, it belongs in `backlog.md`.
- **CHANGELOG entries are written at cut, not staged ahead.** The release slate is the staging area.
- **Audits don't mutate.** Strike with `~~` + reason rather than deleting; promote findings into `backlog.md`/release slates instead.
- **Provenance is mandatory.** Every backlog line and every release-slate line carries `source:`. Every CHANGELOG entry references its plan or audit ID where one exists.

## Release ceremony — `npm run dev:release`

As of v0.13.4, the release cut is automated. As of v0.15.3, the command
moved from the user-facing binary to `scripts/dev/release.ts` and is now invoked via
`npm run dev:release` (see `docs/contributor-vs-user.md`). It runs the full release
ceremony and emits git/PR suggestions without executing any git operations itself.

**What it does (in order):**
1. Validates the target version (semver, strictly > current).
2. Checks that `docs/anvil/releases/v<version>.md` exists and is not already released.
3. Guards against a dirty working tree (`--allow-dirty` to skip).
4. Bumps `version` in `package.json` and `marketplace.json`.
5. Rewrites `tests/unit/release/version-bump-v<new>.test.ts` (new, positive-assertion) and `version-bump-v<old>.test.ts` (historical, anti-stale) — **new file is written first** (load-bearing PR #69 guard).
6. Marks the slate `Status: released <ISO-date>`.
7. Prepends a CHANGELOG entry from the slate's `### Added/Improved/Changed/Fixed` sections.
8. Prints suggested git commands (commit + tag + push) and a PR title.

**Flags:**
- `--dry-run` — print the plan without writing any files (idempotent, machine-readable with `--json`).
- `--json` — emit the structured `ReleasePlan` object.
- `--from <version>` — override current version (default: `package.json`).
- `--allow-dirty` — skip the dirty-tree guard.

**After running (operator steps):**
```bash
# Review the working tree changes
git diff

# Stage and commit
git add -p
git commit -m "chore(release): v<version>"

# Tag and push
git tag v<version>
git push origin HEAD && git push origin v<version>
```

## How AI companions follow this

The composition rule is summarized in `CLAUDE.md` and `AGENTS.md`, both auto-loaded by Claude Code, OpenCode, and Cursor on every session. That covers ~all release-drafting flows in this repo.

If a companion is observed skipping the debt slot in practice, escalate by adding a `release-composition` skill or an `anvil doctor` row that validates plan frontmatter. Don't build those gates pre-emptively — wait for a real leak.
