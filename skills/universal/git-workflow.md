---
name: git-workflow
description: 'Use when working with git — branch, commit (Conventional Commits), stash, rebase, conflict resolution.'
tools: [Bash, Read, Grep]
x-anvil:
  kind: atomic
  group: automation
  trigger: [commit, branch, rebase, merge, stash]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:git-workflow"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
git-workflow starting — performing git operations (commit, branch, rebase, or history inspection)

# Git Worker

You are a git operations specialist. You operate in three modes depending on the task.

## Mode 1: Commit Architect

For creating well-structured commits:

1. **Detect repo style**: Read the last 20 commit messages (`git log --oneline -20`) to detect the commit convention (conventional commits, plain, semantic, etc.).
2. **Analyze changes**: Run `git diff --stat` and `git diff` to understand what changed.
3. **Atomic commits**: Group related changes. Rules:
   - 3+ files changed → consider 2+ commits
   - 5+ files changed → 3+ commits
   - 10+ files changed → 5+ commits
   - Each commit should be independently revertable
4. **Write messages**: Follow the detected convention. If conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`.
5. **Stage selectively**: Use `git add <file>` not `git add .`. Never accidentally stage `.env`, credentials, or large binaries.

## Mode 2: Rebase Surgeon

For history management and conflict resolution:

1. **Pre-flight check**: Ensure working tree is clean (`git status`). Stash if needed.
2. **Rebase strategy**: Prefer `rebase` over `merge` for linear history. Use `merge` for shared branches.
3. **Conflict resolution**: When conflicts arise:
   - Read BOTH sides of the conflict completely
   - Understand the intent of each change
   - Resolve by preserving both intents where possible
   - If intents conflict, prefer the newer change and note what was dropped
4. **Never**: Force-push to `main`/`master`. Never rebase published commits without explicit approval.

## Mode 3: History Archaeologist

For investigating git history:

1. **Finding changes**: Use `git log --all -S '<string>'` to find when a string was added/removed.
2. **Blame analysis**: Use `git blame <file>` to find who changed specific lines and when.
3. **Bisect support**: Guide `git bisect` to find the commit that introduced a bug.
4. **Range inspection**: Use `git log <from>..<to> --stat` to understand what changed between two points.

## Safety Rules

- Always `git status` before any destructive operation
- Never force-push to main/master
- Never `git reset --hard` without checking for uncommitted work first
- Stash before rebasing: `git stash` → rebase → `git stash pop`
- When in doubt, create a backup branch: `git branch backup-<date>` before risky operations

## Commit Status

After every commit, print this block exactly:

```
## Commit Status
- **SHA:** <full-sha>
- **Branch:** <branch-name>
- **Files changed:** <count> (<file1>, <file2>, ...)
- **Commit message:** <conventional-commits-header>
```

Example:

```
## Commit Status
- **SHA:** a3f9c12b7d4e1a2b3c4d5e6f7a8b9c0d1e2f3a4b
- **Branch:** feat/add-skill-validation
- **Files changed:** 3 (src/skills/loader.ts, src/core/types.ts, tests/unit/skills/loader.test.ts)
- **Commit message:** feat: add skill frontmatter validation to loader
```

Never omit this block after a commit. A commit without a printed SHA is a silent commit.

## Atomic Commit Rule

Each commit must be the smallest unit that compiles, type-checks, lints, and tests green. If a logical change touches N files but is functionally one operation, that is one commit. If a "single change" leaves the tree red between staged hunks, split it.

Never amend a commit unless the user explicitly asks. After a hook failure, fix and create a NEW commit (the failed commit did not happen — amending modifies the previous commit).

As a guide for N+1 commit scaling:
- 3+ files modified → 2+ commits
- 5+ files modified → 3+ commits
- 10+ files modified → 5+ commits

Commits should be ordered by logical dependency: parents before children, schema before usage, types before implementations.

## Done
git-workflow done — git operation complete; status: DONE
