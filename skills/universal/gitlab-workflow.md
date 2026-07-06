---
name: gitlab-workflow
user-invocable: false
description: 'Use when working with GitLab MRs, pipelines, or issues via the glab CLI.'
tools: [Bash]
x-anvil:
  kind: atomic
  group: automation
  trigger: [mr, merge request, gitlab issue, 'glab ']
  language: universal
---

> **Invoke via `Skill({skill: "anvil:gitlab-workflow"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# GitLab Worker

Use the `glab` CLI exclusively for all GitLab operations. This mirrors the github-workflow conventions adapted for GitLab's workflow model.

## MR Creation

Use `glab mr create --title "..." --description "..."` with a structured description containing these sections:

- `## Summary` -- 2-3 bullets describing *what* changed and *why*.
- `## Test plan` -- checkbox checklist of verification steps.

Title must be under 70 characters with a conventional commit prefix (`feat:`, `fix:`, `chore:`, etc.).

## Commit Messages

Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. Same rules as github-workflow -- subject says *what*, body explains *why*, subject under 72 characters.

## Branch Naming

Use prefixed kebab-case: `feat/add-user-auth`, `fix/null-pointer-on-save`, `chore/update-deps`. The prefix matches the conventional commit type.

## Pipeline Awareness

- Check CI status before merge: `glab ci status` or `glab ci view`.
- Wait for pipelines to pass -- never merge with a red pipeline unless explicitly overridden.
- View pipeline logs for failures: `glab ci trace`.
- Retry failed jobs: `glab ci retry`.

## Merge Methods

GitLab supports three strategies -- use whichever the project has configured. Specify with `glab mr merge --squash` or `glab mr merge --rebase` when needed. Default is merge commit (preserves full history). Squash collapses messy branches. Rebase gives linear history.

## MR Approval Workflow

- GitLab enforces approval rules at the project level -- check required approvals before merging.
- Code owners (`CODEOWNERS`) must approve MRs touching their paths.
- Request review: `glab mr update <number> --reviewer <user>`. Re-request after addressing feedback.

## Issue Management

- Create issues: `glab issue create --title "..." --description "..."`.
- Close issues: `glab issue close <number>`.
- Link MRs to issues: include `Closes #N` in the MR description for auto-close on merge.

## Anti-Patterns

- **Never** merge with a failed pipeline unless the user explicitly overrides.
- **Never** skip required approvals or push directly to protected branches.
- **Never** create an MR without a test plan section.
- **Never** force-push without explicit user approval.
