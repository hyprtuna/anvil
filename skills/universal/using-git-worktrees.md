---
name: using-git-worktrees
user-invocable: false
description: Use when creating isolated git worktrees for parallel feature work — gitignore-safe directory selection.
tools: [Read, Bash, Edit]
x-anvil:
  kind: atomic
  group: workflow
  trigger: [worktree, isolated workspace, parallel branch, side branch]
  language: universal
  tags: [git, worktree, workflow, isolation]
  aliases: [git worktrees, worktree setup]
---

# Using Git Worktrees

Worktrees let you run multiple branches concurrently from one clone — no stashing,
no context loss. Use them before any long-running feature, plan execution, or
parallel debug run.

## When to Use

- Starting work on a plan while your main checkout has uncommitted edits.
- Running two agents on two branches at the same time.
- Testing a risky refactor without touching your working tree.

**Don't use** for one-line fixes on the current branch — overhead isn't worth it.

## Directory Selection — `.worktrees/<slug>` is canonical

`.worktrees/<slug>` is the **canonical Anvil worktree directory**. ANV-0155
established this in code (the `anvil worktree create` command writes here by
default); ANV-0139 documents it here. Rationale:

- Top-level and hidden, so it stays out of editor file pickers by default.
- Gitignored by default in most `.gitignore` templates, and the safety check
  below adds it if missing.
- Clearly user-owned; it does not bleed into `.claude/worktrees/` (which the
  Claude Code runtime manages for its own subagent lifecycles) or into
  `.git/worktrees/` (which git owns internally).
- Easy single-`ls` discovery: `ls -d .worktrees/*`.

Priority order when selecting a directory:

1. **Existing `.worktrees/`** (hidden, canonical) — use it.
2. **Existing `worktrees/`** (visible) — use it for back-compat.
3. **`CLAUDE.md` preference** — grep for `worktree.*director` and honor the
   stated path. Useful when a project standardised on a different root
   before ANV-0155.
4. **Ask once**, then cache the answer in the repo's `CLAUDE.md`.

```bash
ls -d .worktrees 2>/dev/null || ls -d worktrees 2>/dev/null
```

If neither exists and no preference is recorded, default to `.worktrees/`.

## Safety Verification — always before first `worktree add`

A worktree directory inside the repo must be gitignored or you will commit
branch checkouts back into the main branch.

```bash
git check-ignore -q .worktrees || {
  printf '\n.worktrees/\n' >> .gitignore
  git add .gitignore
  git commit -m "chore: ignore .worktrees/"
}
```

Global worktree roots (e.g. `~/.config/anvil/worktrees/<project>/`) skip this
step because they sit outside the repo.

## Creation Steps

```bash
# 1. Detect project + branch names
project=$(basename "$(git rev-parse --show-toplevel)")
branch="plan-19-reference-enrichments"     # example

# 2. Create the worktree on a new branch
path=".worktrees/$branch"
git worktree add "$path" -b "$branch"
cd "$path"
```

## Project Setup

Auto-detect and run the project's install step so the worktree is usable
immediately:

```bash
[ -f package.json ]     && { command -v bun >/dev/null && bun install || npm install; }
[ -f Cargo.toml ]       && cargo build
[ -f pyproject.toml ]   && { command -v uv >/dev/null && uv sync || pip install -e .; }
[ -f go.mod ]           && go mod download
```

## Verify Clean Baseline

Run the project's test command once before you make any change. A worktree that
starts red hides which failures you introduced versus inherited.

```bash
npm test || cargo test || pytest || go test ./...
```

Record the baseline in the plan's progress log if relevant.

## Cleanup

When work is merged or abandoned:

```bash
git worktree remove .worktrees/<branch>
git branch -D <branch>            # only if merged and no longer needed
git worktree prune
```

Never `rm -rf` a worktree directory — git keeps metadata in
`.git/worktrees/<name>/` and will complain on the next `worktree add` for the
same path. Always go through `git worktree remove`.

## Common Mistakes

- **Creating the worktree root inside the repo without gitignoring it.**
  Your next commit includes the entire sub-checkout. Always run the safety check.
- **Checking out the same branch in two worktrees.** Git refuses; pick a new
  branch name per worktree.
- **Forgetting to `cd` into the worktree** before running commands — you edit
  the main checkout by mistake.
- **Abandoning worktrees without pruning.** `git worktree list` grows; stale
  entries point at deleted paths.

## Integration with Anvil

- Plan execution (`/execute-plan`) runs inside a worktree by default when the
  plan sets `worktree: true` in its frontmatter.
- The `finishing-a-development-branch` skill handles removal after merge.

### Worktree-aware project-root resolution (ANV-0139)

Linked worktrees never contain `.anvil/` — the index lives only at the
canonical repo root. Anvil's hook callers therefore resolve the canonical
project root via `resolveProjectRoot(cwd)` (see `src/core/project/root.ts`):

1. Walk upward from `cwd` looking for `.anvil/` (co-located with `.git/` when
   walking past the start dir, to rule out stray ancestor markers).
2. If the walk hits `.git` first, run
   `git rev-parse --path-format=absolute --git-common-dir`. Linked worktrees
   return `<canonical-repo>/.git`; strip the trailing `/.git` and walk
   upward from there.
3. Otherwise throw `ProjectRootNotFoundError`.

The non-throwing `findProjectRoot(cwd)` wrapper returns `null` instead and
is the typical entry point for hooks (degrades to `cwd` when no anvil
project is found).

## Subagents — prefer `isolation: worktree` over scripting

For Claude Code **subagents** specifically, do **not** drive `git worktree add`
from inside the agent body. Declare the requirement on the subagent's
frontmatter instead:

```yaml
---
name: parallel-task-runner
description: Runs an independent unit of work in isolation
isolation: worktree
---
```

When CC sees `isolation: worktree` it spawns the agent inside a fresh
worktree it manages itself — creation, baseline checkout, and cleanup
all happen for free. This is more reliable than scripting it from the
agent's body because:

- CC handles failure paths (e.g. dirty working tree, branch already
  checked out) consistently across agents.
- Lifecycle removal happens automatically when the agent run finishes;
  there is no chance of leaking a worktree on an early exit.
- The orchestrator gets a stable, predictable workspace for every fan-out
  agent, with no `cd` step in the prompt.

Use the manual `git worktree add` flow above for **non-subagent** work —
human-driven plans, multi-day branches, or any case where you keep using
the worktree after the run that created it ends. Reserve
`isolation: worktree` for subagent invocations whose lifetime matches the
agent's lifetime.
