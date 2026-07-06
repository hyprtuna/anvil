# scripts/dev/ — contributor-only dev tooling

These scripts are excluded from the user bundle (build-time, via
`package.json#files` whitelist — see ANV-0181). They are intended for
Anvil contributors working inside the source tree, invoked via
`npm run dev:<name>` or `bun run scripts/dev/<file>.ts`.

End users never see these scripts; they are NOT installed into `~/.anvil/`.

## When to use which script

| Script | Purpose | npm alias | Invocation |
|---|---|---|---|
| `release.ts` | Release ceremony (version bump + CHANGELOG + plan-copy + tag prep) | `dev:release` | `npm run dev:release -- <version> [--dry-run]` |
| `worktree.ts` | Create/cleanup anvil-style worktrees (ANV-NNNN ticket-aware) | `dev:worktree` | `npm run dev:worktree -- create\|cleanup ...` |
| `pr-branch.ts` | Anvil-style PR branch helper (filters `.anvil/`, `docs/anvil/` prefixes) | `dev:pr-branch` | `npm run dev:pr-branch -- ...` |
| `skill-eval.ts` | Skill evaluation harness (reads `tests/fixtures/skill-eval/`) | `dev:skill-eval` | `npm run dev:skill-eval` |
| `dev-doctor.ts` | Anvil-only doctor checks (26 ceremony + bundle-internal rows) | `dev:doctor` | `npm run dev:doctor [-- --strict --json]` |
| `test-agent.ts` | Focused vitest runner emitting JSON for agent consumption | `dev:test` | `npm run dev:test -- [--pattern <glob>]` |
| `check-status.ts` | Combined repo-state JSON (branch + dirty + gate + tests + counter) | `dev:status` | `npm run dev:status [-- --no-tests]` |
| `verify-skills.ts` | Wraps `anvil skill lint --json` for the local source tree | `dev:verify:skills` | `npm run dev:verify:skills` |
| `verify-agents.ts` | Wraps `anvil agent lint --json` for the local source tree | `dev:verify:agents` | `npm run dev:verify:agents` |

## Per-script reference

### `release.ts` — Release ceremony

Automates the full release cut. Replaces the old `./bin/anvil.cjs release` invocation (moved out of the user-facing binary in v0.15.3).

```bash
# Preview (safe, no writes):
npm run dev:release -- 0.15.4 --dry-run

# Execute (bumps versions, rewrites tests, flips slate, prepends CHANGELOG):
npm run dev:release -- 0.15.4

# After reviewing the working tree changes:
git add -p && git commit -m "chore(release): v0.15.4"
git tag v0.15.4 && git push origin HEAD && git push origin v0.15.4
```

Sample output (dry-run):

```json
{
  "version": "0.15.4",
  "dryRun": true,
  "filesToWrite": ["package.json", "CHANGELOG.md", "docs/anvil/releases/v0.15.4.md"],
  "suggestedCommit": "chore(release): v0.15.4"
}
```

Full ceremony spec: `docs/release-policy.md`.

---

### `worktree.ts` — Ticket-aware worktrees

Creates or cleans up Git worktrees following the `ANV-NNNN-<slug>` naming convention.

```bash
npm run dev:worktree -- create ANV-0191 scripts-dev-docs
npm run dev:worktree -- cleanup ANV-0191-scripts-dev-docs
```

Sample output:

```json
{ "action": "create", "ticket": "ANV-0191", "path": "../anvil-ANV-0191-scripts-dev-docs", "branch": "ANV-0191-scripts-dev-docs" }
```

---

### `pr-branch.ts` — PR branch helper

Generates PR branch names and descriptions filtered for Anvil conventions (`.anvil/`, `docs/anvil/` path prefixes).

```bash
npm run dev:pr-branch -- --ticket ANV-0191 --title "scripts-dev-docs"
```

---

### `skill-eval.ts` — Skill evaluation harness

Runs skill evaluation fixtures from `tests/fixtures/skill-eval/`. Use when developing or tuning a skill.

```bash
npm run dev:skill-eval
```

Sample output:

```json
{ "passed": 12, "failed": 0, "skipped": 2, "skills": ["code-review", "plan-writing"] }
```

---

### `dev-doctor.ts` — Contributor-only doctor checks

Runs the 26 Anvil-internal doctor rows that were removed from `anvil doctor` in v0.15.3 (audience-audit ANV-0185). These checks validate ceremony artifacts, bundle internals, and planning-doc hygiene — not relevant to end users.

```bash
# Standard run:
npm run dev:doctor

# Strict mode (fail on warnings):
npm run dev:doctor -- --strict

# Machine-readable:
npm run dev:doctor -- --json
```

Sample output:

```json
{ "passed": 24, "warned": 2, "failed": 0, "rows": [...] }
```

---

### `test-agent.ts` — Focused vitest runner

Spawns a vitest subprocess filtered to a glob pattern and emits JSON suitable for agent consumption.

```bash
# Run all tests:
npm run dev:test

# Run a specific pattern:
npm run dev:test -- --pattern "tests/unit/docs"
```

Sample output:

```json
{ "passed": 42, "failed": 0, "skipped": 3, "duration_ms": 1840 }
```

**Note:** ANV-0200 (v0.15.4) will refactor this to direct ES-module imports instead of spawning a subprocess.

---

### `check-status.ts` — Combined repo-state JSON

Merges the outputs of `scripts/agent/branch-state.ts`, `scripts/agent/dirty-files.ts`, `scripts/agent/test-summary.ts`, and `scripts/agent/gate-status.ts` into one object. The canonical "are we green?" query for subagents.

```bash
# Full status (may be slow — runs tests):
npm run dev:status

# Skip test run:
npm run dev:status -- --no-tests
```

Sample output:

```json
{
  "branch": "main",
  "aheadBehind": { "ahead": 0, "behind": 0 },
  "dirty": false,
  "untracked": [],
  "gate": "green",
  "tests": { "passed": 142, "failed": 0 },
  "ticketCounter": 191
}
```

**Note:** ANV-0200 (v0.15.4) will refactor this to avoid spawning 4 subprocesses.

---

### `verify-skills.ts` — Skill lint wrapper

Runs `anvil skill lint --json` against the local source tree and surfaces any slug, frontmatter, or user-invocable-count violations.

```bash
npm run dev:verify:skills
```

Sample output:

```json
{ "passed": true, "violations": [] }
```

---

### `verify-agents.ts` — Agent lint wrapper

Runs `anvil agent lint --json` against the local source tree.

```bash
npm run dev:verify:agents
```

Sample output:

```json
{ "passed": true, "violations": [] }
```

---

## Output contract

All scripts emit valid JSON to stdout. Exit 0 on success, exit 2 on
failure. Never write to stderr unless `--debug` is passed. Subagents
should parse stdout as JSON; treat exit code 2 as a fatal failure.

## Architecture boundary

`scripts/dev/` is layer-7 (outermost, per `src/AGENTS.md` rules). It may
import from `src/` but `src/` MUST NOT import from `scripts/dev/`. This
one-way dependency is enforced by the architecture tests under
`tests/unit/architecture/`.

## Known limitations / future work

- `test-agent.ts` currently spawns a nested vitest subprocess. ANV-0200
  (v0.15.4) refactors this to direct ES-module imports.
- `check-status.ts` spawns 4 helper subprocesses; same refactor in ANV-0200.

## When in doubt

- Running the gate? `bun run gate`.
- Cutting a release? `npm run dev:release -- <version>`.
- Checking repo state for agent consumption? `npm run dev:status`.
- Full dev-script index: this file (`scripts/dev/AGENTS.md`).
