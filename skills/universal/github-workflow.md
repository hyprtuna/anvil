---
name: github-workflow
user-invocable: false
description: 'Use when working with GitHub PRs, issues, reviews, or Actions via the gh CLI.'
tools: [Bash]
x-anvil:
  kind: composite
  group: automation
  trigger: [pr, pull request, github issue, 'gh ', release]
  language: universal
  composition: {chains: [{after: code-reviewer}]}
---

> **Invoke via `Skill({skill: "anvil:github-workflow"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
github-workflow starting — performing GitHub operations via gh CLI (PR, issue, review, or release)

# GitHub Worker

Use the `gh` CLI exclusively for all GitHub operations. Never use the GitHub web UI or raw API calls when `gh` can do the job.

## PR Creation

Use `gh pr create --title "..." --body "..."` with a structured body containing these sections:

- `## Summary` -- 2-3 bullets describing *what* changed and *why*.
- `## Test plan` -- checkbox checklist of verification steps.

Title must be under 70 characters with a conventional commit prefix (`feat:`, `fix:`, `chore:`, etc.).

## Commit Messages

Follow conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`. The subject line says *what*; the body (if needed) explains *why*. Keep the subject under 72 characters.

## Branch Naming

Use prefixed kebab-case: `feat/add-user-auth`, `fix/null-pointer-on-save`, `chore/update-deps`. The prefix matches the conventional commit type.

## PR Review Workflow

- Request reviewers: `gh pr edit <number> --add-reviewer <user>`.
- Address feedback commit-by-commit (do not force-push away review history).
- Re-request review after addressing all comments: `gh pr edit <number> --add-reviewer <user>`.
- Check CI status before requesting merge: `gh pr checks <number>`.

## Issue Management

- Create issues: `gh issue create --title "..." --body "..."`.
- Close issues: `gh issue close <number>`.
- Link PRs to issues: include `Closes #N` or `Fixes #N` in the PR body.

## Release Workflow

- Create releases: `gh release create v1.2.3 --title "v1.2.3" --notes "Changelog here"`.
- Attach build artifacts: `gh release upload v1.2.3 ./dist/artifact.tar.gz`.
- Use `--draft` for pre-release review before publishing.

## Anti-Patterns

- **Never** force-push without explicit user approval -- it rewrites shared history.
- **Never** push directly to `main`/`master` -- always use a feature branch and PR.
- **Never** create a PR without a test plan section -- even if it says "Manual verification only."
- **Never** merge with failing CI checks unless the user explicitly overrides.

## PR Created

After every `gh pr create`, print this block exactly:

```
## PR Created — #<num>
- **URL:** https://github.com/<owner>/<repo>/pull/<num>
- **Title:** <pr-title>
- **Branch:** <head-branch> → <base-branch>
- **Reviewers:** <reviewer1>, <reviewer2> (or "none requested")
- **CI next step:** `gh pr checks --watch <num>`
```

Example:

```
## PR Created — #142
- **URL:** https://github.com/your-org/anvil/pull/142
- **Title:** feat: add output-conventions doc and four-state vocabulary
- **Branch:** feat/output-discipline → main
- **Reviewers:** none requested
- **CI next step:** `gh pr checks --watch 142`
```

Never omit this block after a `gh pr create`. A PR without a printed URL is a silent PR.

## Done
github-workflow done — GitHub operation complete; status: DONE
