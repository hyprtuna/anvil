---
name: review-requesting
user-invocable: false
description: 'Use when requesting code review — assembles context, dispatches reviewer, acts on feedback.'
tools: [Read, Bash, Grep, Glob]
x-anvil:
  kind: atomic
  group: review
  trigger: [request review, get review, review my code, need a review]
  language: universal
  tags: [review, feedback, quality]
  aliases: [requesting code review, code review request]
---

> **Invoke via `Skill({skill: "anvil:review-requesting"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Review Requester

Review early, review often. Don't wait until the PR to discover issues.

## When to Request Review

Request review at these natural checkpoints:

- **After completing a plan task**: Each task in an implementation plan is a review boundary. Get feedback before moving to the next task.
- **After a significant feature implementation**: Any change that adds new behavior, not just refactoring or cleanup.
- **Before merging to main**: Always. No exceptions. Even "trivial" changes deserve a sanity check.
- **When you're unsure about an approach**: If you debated between two designs, get a second opinion before committing to one.

Do NOT request review for:
- Trivial formatting changes (unless they affect many files)
- Dependency version bumps with no code changes
- Work-in-progress that you know is incomplete

## How to Request Review

### Step 1: Gather Context

Run these commands to understand what changed:

```bash
git diff --stat                    # files changed, insertions/deletions
git log --oneline -5               # recent commit messages
git diff [base-branch]...HEAD      # full diff from branch point
```

Identify:
- Which files were modified, added, or deleted
- The total scope of the change (lines, files, modules affected)
- Whether tests were added or modified

### Step 2: Prepare the Request

Assemble a structured review request with these sections:

1. **What was implemented**: One sentence summary of the change.
2. **Why**: Link to the spec, plan task, or issue that motivated this work.
3. **What changed**: List of files/modules affected, grouped by purpose.
4. **What to focus on**: Direct the reviewer's attention. Examples:
   - "The new caching logic in `src/core/cache.ts` — is the invalidation strategy correct?"
   - "I'm not sure about the error handling in the retry loop."
   - "Does the schema migration handle the edge case where X?"
5. **What NOT to focus on**: Save the reviewer time. Examples:
   - "Ignore the formatting changes in `utils.ts` — that's from the linter."
   - "The TODO on line 42 is tracked in issue #19."

### Step 3: Dispatch the Reviewer

Launch the `code-reviewer` agent with the assembled context. Provide:
- The target (file paths, glob pattern, or "staged")
- The context from Step 2
- Any project-specific review criteria from CLAUDE.md

## Acting on Feedback

When you receive review findings, triage by severity:

### Critical Issues
Fix immediately. These are bugs, security vulnerabilities, or correctness problems. Do NOT proceed to the next task until all critical issues are resolved. Re-request review after fixing.

### Important Issues (High/Medium Severity)
Fix before moving to the next task. These are design problems, missing edge cases, or test gaps. They won't crash production but they'll cause pain later.

### Suggestions (Low Severity)
Note them. Fix if time permits or if they're quick wins. If you disagree, explain why — cite project conventions, performance constraints, or scope boundaries.

### Disagreeing with Feedback

If you believe feedback is incorrect or inappropriate for this codebase:

1. **State your position clearly**: "I disagree because X."
2. **Cite evidence**: Project conventions, benchmarks, upstream docs, prior art in this codebase.
3. **Propose an alternative**: If you won't do what's suggested, say what you WILL do.
4. **Never silently ignore feedback**: Every finding gets a response — either a fix or an explanation.

## Output Format

Structure your review request as:

```
## Review Request

**Summary**: [one sentence]
**Spec/Issue**: [link or reference]
**Branch**: [branch name]
**Commits**: [count] commits, [lines added]+/[lines removed]-

### Files Changed
- `path/to/file.ts` — [what changed and why]
- `path/to/test.ts` — [test coverage for the above]

### Focus Areas
1. [specific question or concern]
2. [specific question or concern]

### Out of Scope
- [things the reviewer can skip]
```
