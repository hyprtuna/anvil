# Release Workflow Doctrine

> Authoritative agent-orchestration pipeline for shipping an Anvil release.
> Agent-readable and human-readable. Adapted 2026-06-21 from the hyprfolio
> release-workflow doctrine; Anvil-specific throughout (TypeScript / Bun /
> Vitest, the slate plan format, ANV-NNNN tickets, `bun run gate`, and
> `npm run dev:release`).

This document is the **full pipeline** that drives a release from "branch
cut" to "main merged + local clean." It composes with — and does not
duplicate — two existing contracts:

- **`docs/release-policy.md`** — the **composition contract** (debt /
  improvement / addition / fix / docs floors + caps, semver mapping, the
  `npm run dev:release` ceremony spec). This doctrine *enforces* that policy
  at pre-flight; it does not restate it.
- **`AGENTS.md § Release Ceremony`** — the **operator command sequence**
  (`npm run dev:release -- <v> --dry-run`, then the git/tag/push commands).
  This doctrine *wraps* that ceremony as Step 5.

If anything here conflicts with `docs/release-policy.md`, the policy wins on
composition and the ceremony script (`scripts/dev/release.ts`) wins on what
the cut actually writes.

---

## Model routing (default)

| Role | Tier | Notes |
|---|---|---|
| Orchestrator (inline) | **Opus High** | Sole arbiter; branches, pushes, merges, adjudicates. |
| Planner / Strict reviewer / Architecture | **Opus High** | Where bad output cascades — pay for capability. |
| Coder / Fixer / implementer | **Sonnet** | Executes a decided plan; gates catch residual risk. |
| Ship gate / git-prep / mechanical | **Sonnet** (or cheaper) | `dev:release` is scripted; little reasoning. |
| Release-prep / ticket-prep (when missing) | **Opus High**, dispatched first | Minting tickets / writing the slate is design work. |

**Implementer-tier escalation (selective).** Keep the implementer on Sonnet
for localized edits, config wiring, well-specified mechanical changes, tests,
and docs. Escalate the **implementer to Opus High** when the ticket is
cross-cutting into a high-blast-radius subsystem (model resolution, the
adapter generate pipeline, the manifest schema, the installer, the hook
dispatcher), is a refactor whose shape emerges as you edit, leaves
architectural forks the plan could not pre-decide, or a Sonnet pass already
returned `blocked`/regressed on the same task. The planner appends one line to
its summary — `IMPLEMENTER-TIER: opus|sonnet` — and the orchestrator honors it.

## Concurrency

- **Serial is the default.** ONE implementer at a time, committing directly on
  the release branch. A planner for ticket N+1 may overlap the coder for
  ticket N (disjoint write paths — planners write plan files, coders write
  source).
- **Parallel mode is opt-in** and capped at **5 concurrent subagents**
  (matching the orchestrator skill's hard cap). Each parallel coder MUST work
  in its own per-ticket worktree on its own `ticket/ANV-NNNN` branch off
  `release/v<x.y.z>`; the orchestrator cherry-picks each commit onto the
  release branch at the wave boundary. Same-file tickets never share a wave.
- **Prompt the owner serial-vs-parallel before the implementation phase**
  unless told to run autonomously this cycle.

Subagents NEVER push, branch, or merge to main. The inline orchestrator is the
sole arbiter of remote state and the `main` branch.

---

## TL;DR for agents — dispatch shape

```
SEQUENTIAL mode (default for ≤ 3-ticket releases / patches)
Orchestrator (Opus High, INLINE) — adjudicates, branches, pushes, merges
   |
   ├─ Step 1: Cut release branch + worktree (INLINE bash, no subagent)
   |
   ├─ Step 2: Per-ticket loop (ONE coder at a time, single release worktree)
   |   ├─ D.1  Planner       (Opus High, anvil:subagent-executor — writes per-ticket plan; returns ONLY path + 5-line summary)
   |   ├─ D.2  Plan verify    (INLINE — skim the 5-line summary; subagent only on escalation)
   |   └─ D.3  Coder + gate + commit (Sonnet — edits worktree, runs `bun run gate` BEFORE commit, ONE conventional commit on release/v<x.y.z>)
   |
   ├─ Step 3: Two-stage review (anvil:two-stage-review → spec-reviewer then code-quality-reviewer; strict-reviewer for high-stakes diffs)
   ├─ Step 4: Fixer per finding (Sonnet, anvil:subagent-executor)
   └─ Step 5: Ship (npm run dev:release → commit → push → PR+merge → tag → clean)
```

```
PARALLEL mode (opt-in; owner chooses at the implementation-phase prompt; ≤ 5 concurrent)
   ├─ Step 1: Cut release branch + worktree (INLINE)
   ├─ Step 2: Per-wave loop
   |     a. Orchestrator (INLINE) creates N ticket worktrees off release/v<x.y.z>
   |     b. ≤ 5 coders dispatch in parallel (Sonnet), each in its own worktree/branch, ONE commit each
   |     c. Orchestrator (INLINE) cherry-picks each commit onto release/v<x.y.z> in deterministic order
   |     d. Orchestrator (INLINE) prunes ticket worktrees + branches
   ├─ Step 3 / Step 4 / Step 5: identical to sequential (run against final release-branch state)
```

---

## A. Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                ORCHESTRATOR — Opus High (INLINE)                  │
│  Sole arbiter. Cuts branch. Pushes. Merges. Adjudicates findings. │
└─────────────────────────────┬────────────────────────────────────┘
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────────┐  ┌────────────────────┐  ┌──────────────────┐
│ Per-ticket loop  │  │ Review gate (§E/§J) │  │ Shipper (§G)     │
│ Planner (Opus)   │  │ spec-reviewer →     │  │ G.1 dev:release  │
│   ▼              │  │ code-quality-       │  │ G.2 commit       │
│ Plan-verify skim │ ►│ reviewer / strict-  │ ►│ G.3 push         │
│   ▼              │  │ reviewer            │  │ G.4 PR + merge   │
│ Coder + gate     │  │   ▼                 │  │ G.5 tag + clean  │
│ + commit (Sonnet)│  │ Fixer (Sonnet)      │  │ (INLINE git ops) │
│ NO push/branch   │  │ loop until clean    │  │                  │
└──────────────────┘  └────────────────────┘  └──────────────────┘
```

The inline orchestrator holds the broadest context (full slate, ticket
ledger, reviewer output) and is the sole decision authority. Subagents return
outputs; the orchestrator adjudicates.

---

## B. Pre-flight (before cutting the release)

All checks inline. If any FAILS, halt and surface to owner.

### B.1 Main branch state

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git status --porcelain        # MUST be empty
# package.json version MUST equal the last shipped tag:
test "v$(node -p "require('./package.json').version")" = "$(git tag --sort=-version:refname | head -1)"
```

If the version does not match the last tag, the prior release shipped without
a clean bump — fix that first (its own commit on `main`) before cutting.

### B.2 Gate is green on main

```bash
bun run gate     # biome lint + typecheck (tsc --noEmit) + vitest run
```

A red gate on `main` is a halt condition — never cut a release branch off a
broken baseline.

### B.3 Planning artefacts exist

- **`.anvil/plans/v<x.y.z>.plan.md`** exists, is `Status: planned` (not
  `draft`), and carries the composition table + the full task list with one
  `ticket:` per task.
- **`docs/anvil/releases/v<x.y.z>.md` does NOT yet exist** — released slates
  only live there post-cut (drafting one for unreleased work is a policy
  violation per `docs/AGENTS.md`). The `dev:release` ceremony creates it.

### B.4 Ticket completeness

Every ticket the slate references MUST have a file at
`.anvil/tickets/ANV-NNNN-<slug>.md` (a plan reference with no ticket file is a
policy violation, `.anvil/AGENTS.md § Hard rules`). Each ticket MUST carry:

- Frontmatter: `id`, `type` (`feature|fix|improvement|debt|docs`), `priority`,
  `effort`, `target_version: v<x.y.z>`, `status`, `source_findings`.
- A `## Summary`, `## Evidence` (with `file:line` citations), `## Requirements`,
  `## Acceptance criteria`, and `## Out of scope` section.

A draft slate may reference not-yet-filed tickets; **promote draft→planned by
filing every missing ticket first** (bump `.anvil/_ticket-counter.txt`). The
planner subagent receives only the ticket file + a brief — a ticket missing AC
forces the planner to invent it and leaves the verifier nothing to verify.

### B.5 Composition policy satisfied

Confirm the slate's composition table obeys `docs/release-policy.md`:

- Floors/caps per category (debt 1–2, improvements 1–3, additions 1–3, fixes
  1–3, docs 0–2). Empty categories MUST be justified in the slate.
- No single item exceeds 40% of the release diff; `z` ≤ ~1500 LOC, `y` ≤ ~4000.
- Security / data-loss / install-breakage items may ship alone (priority
  override) — note it in the slate.

If the composition is out of policy, fix the slate (re-scope or split) BEFORE
cutting. This is the one pre-flight check Anvil adds that hyprfolio's doctrine
does not — Anvil's release-policy is binding and mechanical.

---

## C. Step 1 — Cut release branch + worktree

**Done INLINE by the orchestrator. NOT delegated.** A subagent that runs
`git worktree add` / `git checkout -b` has, by definition, the capability to
mutate the parent repo's branch graph — the exact capability the isolation
rules forbid.

```bash
git checkout main
git pull --ff-only origin main

VERSION_TARGET="x.y.z"            # e.g. 0.18.0
RELEASE_BRANCH="release/v${VERSION_TARGET}"
WORKTREE_PATH=".worktrees/release-v${VERSION_TARGET}"

git worktree add -b "${RELEASE_BRANCH}" "${WORKTREE_PATH}" main
( cd "${WORKTREE_PATH}" && git rev-parse --abbrev-ref HEAD )   # → release/v<x.y.z>
```

**Naming is load-bearing.** Subagents grep `.worktrees/release-v` to confirm
they are inside a release worktree. `references/` is gitignored and ABSENT in
worktrees — if a brief needs a reference path, inject the FULL ABSOLUTE path
(`/path/to/anvil/references/...`).

---

## D. Step 2 — Per-ticket loop

Iterate the task order in `.anvil/plans/v<x.y.z>.plan.md`. Sequential mode
(default) runs ONE coder at a time in the release worktree. Parallel mode
(opt-in, ≤ 5 concurrent) gives each ticket its own worktree + `ticket/ANV-NNNN`
branch and cherry-picks into the release branch at the wave boundary.

### D.0 Concurrency rule

| Rule | Sequential | Parallel (opt-in) |
|---|---|---|
| Max concurrent agents (any type) | 2 (planner overlap) | **5 (absolute)** |
| Coder works in | release worktree, commits on `release/v<x.y.z>` | per-ticket worktree on `ticket/ANV-NNNN` |
| Convergence | direct commit | orchestrator cherry-picks at wave boundary |
| Disjoint-file rule | n/a (serial) | **mandatory** — same-file tickets never share a wave |

Two coders in the same worktree race on the `.git/index`, the release-branch
HEAD ref, and `git status` views — forbidden even with disjoint files. Parallel
mode's per-ticket worktree eliminates all three races; the cherry-pick step is
the single-threaded convergence point.

### D.1 Planner dispatch (Opus High)

**Agent:** `anvil:subagent-executor` (write-to-disk; default) or
`anvil:code-architect` (read-only, returns plan in message — use when the
ticket has 2+ plausible approaches with real trade-offs).

The planner reads the ticket + related source in full and writes a tight
implementation plan to **`.anvil/plans/ANV-NNNN-<slug>.md`** (per-ticket
implementation plan — distinct from the release slate). It returns ONLY:

```
PLAN: <plan_path>
FILES: <comma-separated touch list>
ACS: <count>
DEVIATIONS: <one-line or "none">
IMPLEMENTER-TIER: opus|sonnet
STATUS: ready | blocked: <reason>
```

The orchestrator does NOT echo the plan body back through a Write call —
passing the plan around doubles it in context. Brief MUST include the
hard-isolation block (CWD = the worktree; no writes outside it; no commits/
push/branch; static inspection only — `git status/diff/log/show`).

### D.2 Plan verify — INLINE-MINIMAL

Skim the 5-line summary. Do NOT read the plan body back (the coder reads it in
full at D.3 and is the de facto verifier).

- `ready` + `none` → dispatch D.3.
- `ready` + drift deviation (line shift, rename) → accept, note in the brief.
- `ready` + scope/AC-reinterpretation deviation → read the plan inline, adjudicate.
- `blocked` → re-dispatch D.1 with the gap list (max 3), then escalate.

Fire `anvil:plan-verifier` as a subagent only on genuine ambiguity
(cross-cutting refactor, unusual AC shape) — it is not the default.

### D.3 Coder dispatch (Sonnet — gates + commits on release branch)

**Agent:** `anvil:subagent-executor`. **Input:** ticket file + the verified
plan + the release worktree path.

The coder writes code AND commits it. **Forbidden:** any remote op
(`push`/`pull`/`fetch`), any branch op (`checkout`/`switch`/`branch`/`merge`/
`rebase`/`cherry-pick`/`reset --hard`/`stash`), `--no-verify`, writes outside
the worktree, and any live-environment mutation. **Permitted git:**
`status`/`diff`/`log`/`show`, `git add <explicit-paths>` (never `git add -A`),
and exactly ONE `git commit`.

**Gate stanza — run BEFORE staging; commit only when green (max 2 retries):**

```bash
bun run gate                 # biome + typecheck + vitest — the whole gate
# (or, to iterate fast during the loop:)
bun run lint && bun run typecheck && bun run test <the specific test files the ticket touches>
```

Anvil's gate is real (vitest), unlike hyprfolio's static-only doctrine — the
coder runs the actual test suite, not a grep. Commit shape:

```
<feat|fix|refactor|chore|test|docs>(<scope>): ANV-NNNN <one-line summary>

<2-3 line body — what + why; reference the plan/ticket>
```

Report on return: `GATE: green`, `TESTS: <N/N>`, `COMMIT_SHA: <sha>`,
`FILES: <touched list>`. On non-convergence after 2 retries, escalate; the
orchestrator may `git reset --hard HEAD~1` on the release branch to discard a
partial commit before re-dispatching.

**Parallel-mode addendum.** The brief MUST name (a) the explicit worktree path
to `cd` into first, (b) the `ticket/ANV-NNNN` branch to verify with
`git rev-parse --abbrev-ref HEAD` before any edit, (c) "commit on this branch
only; the orchestrator cherry-picks after the wave — no push, no branch switch,
no cross-branch cherry-pick," (d) "exactly ONE commit."

---

## E. Step 3 — Review gate

Once all tickets are on `release/v<x.y.z>` and `bun run gate` is green:

**Default: `anvil:two-stage-review`** — Stage 1 `anvil:spec-reviewer`
(completeness / no-extras / interface correctness against the slate's
acceptance criteria, MANDATORY for every release), then Stage 2
`anvil:code-quality-reviewer` (correctness, architecture, security,
performance, test quality).

**High-stakes diffs:** add `anvil:strict-reviewer` — the adversarial pass that
names the trade-offs the change locks in. Reserve for releases that touch
model resolution, the adapter pipeline, the manifest schema, or the installer.

**Input:** `git diff main...release/v<x.y.z>`, the slate's ticket ledger, the
AGENTS.md hard constraints (layered import rules, no `any`, named exports,
Zod at boundaries, slash-command CLI parity, adapters-are-leaves).

**Output (JSON):** findings keyed `critical|high|medium|low`, each with
`{file, line, ticket, finding, fix_hint}`. Reviewers are read-only
(`Read/Glob/Grep`) — they propose fixes in implementation-plan shape; a Sonnet
fixer applies them.

**Adjudication:** Critical → BLOCK. High/Medium/Low → fix in-release via Step 4
(no mid-release deferral to backlog). Re-run the reviewer on the TIGHT fix diff
only, loop until clean.

---

## F. Step 4 — Fixer (Sonnet)

**Agent:** `anvil:subagent-executor`. **Input:** the verbatim reviewer finding
+ `file:line` + `fix_hint`. Same hard role boundary as D.3 (stages + commits on
the release branch; no push/branch/merge). Add a regression test when the
finding is a class that can recur.

```
fix(release): ANV-NNNN-review-<topic> — <one-liner>
```

**Plan-before-fix for non-trivial fixes.** Mechanical / test-only / lint-only /
doc-only fixes dispatch directly. Findings that carry real implementation
(multi-file logic, a design fork, a new contract, behavior change) get a
planner first (`.anvil/plans/ANV-NNNN-review-<topic>.md`), then the fixer
implements against it. A `blocked` from a direct fixer is the signal to insert
a planner. **Convergence ceiling:** 3 fixer dispatches per finding, then escalate.

---

## G. Step 5 — Ship

| Sub-step | Mode | Why |
|---|---|---|
| G.1 Release ceremony | INLINE (scripted) | `dev:release` is deterministic; dry-run first. |
| G.2 Commit | INLINE or Sonnet | Pure stage-and-commit on the staged set. |
| G.3 Push | INLINE | Network op against the user's credentials. |
| G.4 PR + merge | INLINE | `gh` operates on the user's GitHub credentials. |
| G.5 Tag + local clean | INLINE | Requires `ExitWorktree` (orchestrator-only). |

### G.1 Release ceremony (`npm run dev:release`)

```bash
# Dry-run first (writes nothing; --json for machine-readable plan):
npm run dev:release -- <x.y.z> --dry-run

# Then execute — bumps package.json + marketplace.json, rewrites version-bump
# tests, flips the slate to Status: released <ISO>, copies it to
# docs/anvil/releases/v<x.y.z>.md, and prepends the CHANGELOG entry:
npm run dev:release -- <x.y.z>
```

The script executes **no git operations** — it only writes files and prints
suggested git commands. Review with `git diff` before committing. Full spec:
`docs/release-policy.md § Release ceremony` and `scripts/dev/AGENTS.md`.

### G.2 Commit the release

```bash
( cd .worktrees/release-v<x.y.z> && \
  git add -p && \
  git commit -m "chore(release): v<x.y.z>

<theme one-liner + 2-3 line summary from the slate>" )
```

### G.3 Push (INLINE)

```bash
( cd .worktrees/release-v<x.y.z> && git push -u origin release/v<x.y.z> )
```

Network failure → exponential backoff (2s/4s/8s); after 3 attempts surface to owner.

### G.4 PR + merge (INLINE)

```bash
gh pr create --base main --head release/v<x.y.z> \
  --title "release(v<x.y.z>): <theme>" \
  --body-file docs/anvil/releases/v<x.y.z>.md
gh pr merge <PR> --squash
git push origin --delete release/v<x.y.z>
```

**Do NOT pass `--delete-branch`** when shipping from inside a managed worktree
— `gh`'s post-merge step tries to switch the release worktree to `main`, which
is already checked out in the parent worktree, and fails its local-cleanup half
("`main` is already used by worktree at …"). The 3-step split above (squash on
remote → delete remote branch → G.5 local teardown) avoids the partial-state
failure.

### G.5 Tag + local cleanup (INLINE)

```bash
# Annotated tag on the squash commit (AGENTS.md mandates annotated tags):
git tag -a v<x.y.z> -m "release v<x.y.z>" <squash-sha>
git push origin v<x.y.z>
```

Then leave the worktree via the harness primitive (subagents cannot call it):

```
ExitWorktree(action: "remove", discard_changes: true)
```

`discard_changes: true` is correct — the worktree's individual commits live on
the now-deleted release branch; after the squash-merge they exist on `main` as
ONE commit (different SHAs), so discarding the local per-commit refs preserves
content on `main`. Back in the parent root:

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git log --oneline -3      # confirm the squash commit at HEAD
git worktree list         # only main should remain
```

---

## H. Adjudication

The inline orchestrator is the **sole arbiter**.

| Decision | Arbiter | Rationale |
|---|---|---|
| Plan ready/blocked | Planner summary; orchestrator gates retries | Planner reasons; orchestrator gates the budget. |
| Coder convergence | Orchestrator via `bun run gate` | The gate is ground truth. |
| Review severity | Reviewer JSON; orchestrator routes | Critical→block, others→fixer. |
| Defer vs fix | Orchestrator | Everything resolved in-release; no mid-release backlog deferral. |
| Escalation | Orchestrator → owner | After retry budget (planner 3, coder 2, fixer 3). |

---

## I. Failure handling

| Failure mode | Action |
|---|---|
| Planner blocked 3× on one ticket | Escalate — likely a ticket-completeness bug, not a planner bug. |
| Coder fails to reach green in 2 retries | Escalate — likely a plan bug. |
| Review Critical | Block; loop Step 4. No exceptions. |
| Review High/Medium/Low | Fix in-release via Step 4. |
| Fixer fails to converge in 3 dispatches | Escalate — finding may be ill-formed. |
| Push (G.3) network failure | Backoff 2s/4s/8s; after 3, surface to owner. |
| `gh pr create/merge` fails | Surface immediately — auth/permissions. |
| `dev:release` reports a dirty tree or bad version | Halt; fix the precondition, re-run dry-run. |
| Release branch has divergent commits from another worktree | Halt — the release worktree must be the SOLE writer. |

---

## J. Conditional review gating

Stage-1 spec-compliance review (`anvil:spec-reviewer`) is **MANDATORY for every
release** — it is cheap and catches AC drift. Stage-2 code-quality review MAY be
skipped only when the work is provably non-code, via **declarative intent +
mechanical override**:

### J.1 Per-ticket type matrix

| `type:` | Stage-2 code-quality review |
|---|---|
| `docs` | SKIPPABLE |
| (research / audit ticket) | SKIPPABLE |
| `improvement` / `fix` / `feature` / `debt` | MANDATORY |

### J.2 Mechanical override (the safety grep)

A declared skip is overridden if the diff actually touched code:

```bash
( cd .worktrees/release-v<x.y.z> &&
  git diff --name-only main..release/v<x.y.z> |
    grep -qE '\.(ts|tsx|js|cjs|mjs|json)$' ) \
  && echo "code touched — Stage-2 / strict review FIRES regardless of declaration" \
  || echo "docs-only — honor the skip"
```

Exit 0 (code touched) → review FIRES; exit 1 → honor the declared skip. The
override is what makes the gate safe — never honor a `type: docs` skip without
running it.

### J.3 What is NEVER skippable

- D.2 plan-verify skim (every ticket).
- D.3 `bun run gate` before commit (every ticket).
- Stage-1 spec-compliance review (every release).
- G.1 `dev:release` dry-run before the real run (every release).

---

## K. Anti-patterns (do NOT do)

- **DO NOT** delegate the release cut (Step 1), push (G.3), PR+merge (G.4), or
  tag/`ExitWorktree` (G.5) to a subagent — these are inline-orchestrator ops.
- **DO NOT** run `npm run dev:release` without `--dry-run` first.
- **DO NOT** have the coder/fixer push, branch, merge, or cherry-pick. One
  conventional commit per ticket on the release branch; all other git ops are
  orchestrator-only.
- **DO NOT** dispatch two coders in the SAME worktree. Parallel mode requires
  per-ticket worktrees; same-worktree concurrency races on index/HEAD/status.
- **DO NOT** exceed 5 concurrent subagents (orchestrator-skill hard cap).
- **DO NOT** read the planner's plan body inline at D.2 — skim the 5-line
  summary; the coder reads the plan in full.
- **DO NOT** cut a release off a red `bun run gate` or an out-of-policy
  composition table (§B.2, §B.5).
- **DO NOT** create `docs/anvil/releases/v<x.y.z>.md` by hand for unreleased
  work — `dev:release` creates it at cut time (drafting it early is a policy
  violation).
- **DO NOT** defer review findings to backlog mid-release — resolve in-release.
- **DO NOT** honor a `type: docs` / Stage-2 skip without the §J.2 override grep.
- **DO NOT** pass `gh pr merge --delete-branch` from inside a managed worktree
  (§G.4).
- **DO NOT** amend the release commit after push — create a new
  `fix(release): …` commit instead.

---

## L. Why this shape

- **Per-role model routing** (Opus for plan/review, Sonnet for code, scripted
  ship) maximises capability-per-token where bad output cascades and saves
  tokens where the work is mechanical.
- **Sequential coder + bounded planner overlap** preserves the zero-conflict
  property of a single writer to the release branch while letting one planner
  run ahead. Parallel mode with per-ticket worktrees keeps the same property by
  isolating each coder and converging single-threaded at the cherry-pick.
- **Release-granularity review** (not per-ticket) catches integration-level
  drift — cross-ticket contract breaks, accumulated debt, missing constraints —
  that per-ticket review misses. Anvil's two-stage-review skill is the canonical
  vehicle; strict-reviewer is the adversarial escalation for high-stakes diffs.
- **Scripted ship (`dev:release`)** removes the manual-checklist error class
  that a hand-edited release is prone to: version bumps, CHANGELOG, slate flip,
  and the release-doc copy are one deterministic, dry-runnable command.
- **Inline orchestrator as sole arbiter** keeps decision authority where the
  broadest context lives. Subagents have narrow remits; the orchestrator sees
  the full slate, ledger, and reviewer output at once.

---

## M. Dogfood gate (install-correctness, before ship)

Anvil's analog of a runtime smoke test. Before G.1, the orchestrator runs the
real install against the release-branch build and requires it clean:

```bash
( cd .worktrees/release-v<x.y.z> && \
  npm run build && \
  ./bin/anvil.cjs init --yes --preset balanced --target both && \
  ./bin/anvil.cjs doctor )
```

`anvil doctor` MUST exit clean (no FAILs; the ≤15 user-invocable-skills warning
and other warns are adjudicated by the orchestrator). A release that breaks
`anvil init` or `anvil doctor` on a clean tree is an install-breakage override
(`docs/release-policy.md § Priority overrides`) and blocks the ship regardless
of the review outcome. This runs the real binary on the authorized dev box; it
is an orchestrator-inline dogfood step, never a test file.
