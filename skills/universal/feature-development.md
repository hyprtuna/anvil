---
name: feature-development
description: 'Use when implementing an end-to-end feature — plan, code, test, PR.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: composite
  group: development
  trigger: [implement, build feature, add feature, ship]
  language: universal
  notepads_section: problems
  composition: {chains: [{after: planning}, {before: code-reviewer}, {before: verification}, {before: github-workflow}]}
---

> **Invoke via `Skill({skill: "anvil:feature-development"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

## Status
feature-development starting — end-to-end feature implementation from requirements to working, reviewed code

# Feature Developer

End-to-end feature implementation from requirements to working, reviewed code. Seven phases, each with a clear exit gate.

## Phase 1: Discovery

Understand what needs to be built before writing any code.

1. **Read the requirements**: spec, issue, user request, or plan task. Identify the exact scope.
2. **Identify acceptance criteria**: What does "done" look like? Be specific:
   - What behavior should exist that doesn't exist now?
   - What inputs/outputs are expected?
   - What error cases must be handled?
3. **Ask clarifying questions** if requirements are ambiguous. Do not assume:
   - "Should X handle the case where Y?" is better than silently choosing a behavior.
   - "The spec says Z but doesn't mention W — is W in scope?" prevents scope creep or gaps.
4. **Check for blockers**: Are there dependencies that need to land first? Unresolved design questions? Missing APIs?

**Exit gate**: You can state in one paragraph what you're building, why, and how you'll know it's done.

## Phase 2: Codebase Exploration

Understand the relevant parts of the codebase before designing a solution.

1. **Launch 1-2 code-explorer agents** (or use Grep/Glob directly) to map the territory:
   - Find existing code related to the feature area
   - Identify the modules, files, and functions you'll need to modify or extend
   - Locate relevant tests, types, and configuration
2. **Read the essential files** the exploration identified. Focus on:
   - Public APIs and interfaces you'll consume or extend
   - Existing patterns for similar features (how was the last feature like this built?)
   - Test patterns (how are similar features tested?)
3. **Map conventions**: Check CLAUDE.md, folder-level CLAUDE.md files, lint config, and existing code for:
   - Naming conventions (files, functions, variables, types)
   - Error handling patterns (throw? return Result? error codes?)
   - Import/export patterns (named exports, barrel files, etc.)
   - State management approach
4. **Identify integration points**: Where does your new code connect to existing code? What existing abstractions should you use vs. create new ones?

**Exit gate**: You have a mental model of the relevant codebase and know which files/modules are involved.

## Phase 3: Clarifying Questions

Based on what you learned during exploration, surface any remaining ambiguity.

1. **List underspecified aspects**: Now that you've seen the codebase, what gaps exist between the requirements and reality?
   - "The spec says 'validate input' but the existing validator in `src/core/validate.ts` uses Zod — should I extend that schema or create a new one?"
   - "There's an existing `FooService` that handles similar work — should I extend it or create a parallel `BarService`?"
2. **Present questions and wait**: Do not proceed until answered. Do not assume.
3. **If no questions remain**: State that explicitly and move to Phase 4.

**Exit gate**: All ambiguities are resolved. You have enough information to design the solution.

## Phase 4: Architecture Design

Design before implementing. The cost of changing a design on paper is near zero; the cost of changing code is not.

1. **Launch the code-architect agent** (or design inline) with full codebase context from Phase 2.
2. **Present 2-3 approaches** to the user. For each approach:
   - **Description**: What it does, in one paragraph.
   - **Pros**: Why this approach is good.
   - **Cons**: Why this approach might not be ideal.
   - **Effort**: Rough estimate (small/medium/large).
   - **Files affected**: Which files need to change.
3. **Include a recommended approach** with reasoning, but let the user choose or modify.
4. **Outline the implementation order**: Which components get built first? What are the dependencies between them?

If the feature is small enough that the architecture is obvious (e.g., adding a field to a schema, fixing a bug), skip to Phase 5 with a brief note: "Architecture is straightforward — [one sentence description]. Proceeding to implementation."

**Exit gate**: User has approved an approach. You have an ordered list of implementation steps.

## Phase 5: Implementation

Build the feature following the chosen architecture.

1. **Write tests first** (TDD discipline from `test-driven-development`):
   - For each component, write the test that describes the desired behavior.
   - Run the test — confirm it fails for the right reason.
   - Implement the minimum code to make the test pass.
   - Refactor if needed, re-run tests.
2. **Track progress with TodoWrite**: Mark each implementation step as you complete it so progress is visible.
3. **Follow existing patterns**: Use the conventions you mapped in Phase 2. Don't invent new patterns unless the existing ones genuinely don't fit.
4. **Commit after each verified step**: Each commit should be a working, tested increment. The commit message should reference what was built and why.
   - Good: `feat: add skill validation to loader — rejects malformed frontmatter`
   - Bad: `wip` or `more changes`
5. **Handle blockers immediately**: If you discover something unexpected during implementation:
   - If it's a bug in existing code: fix it in a separate commit before proceeding.
   - If it requires a design change: go back to Phase 4 with the new information.
   - If it's out of scope: note it as a TODO and keep moving.

**Exit gate**: All implementation steps are complete. All tests pass. Code is committed.

## Phase 6: Quality Review

Don't mark the feature as done until it's been reviewed.

1. **Launch the code-reviewer agent** on the completed changes:
   - Provide the full diff from the branch point
   - Include context about what was built and why (from Phase 1)
   - Highlight areas you're uncertain about
2. **Triage findings by severity**:
   - **Critical**: Fix immediately. Do not proceed.
   - **Important** (high/medium): Fix before moving to the next task.
   - **Suggestions** (low): Fix if quick; otherwise note for later.
3. **Consider launching test-analyzer** if:
   - The reviewer flagged test gaps
   - You're unsure about edge case coverage
   - The feature touches critical paths (auth, data persistence, billing, etc.)
4. **Re-run full test suite** after all fixes. Every test must pass.

**Exit gate**: All critical and important review findings are resolved. Tests pass.

## Phase 7: Summary

Document what was done so the next development (or future you) has context.

1. **What was built**: One paragraph summary of the feature.
2. **Key decisions made**: List the non-obvious choices and why they were made.
   - "Used polling instead of websockets because the update frequency is low (~1/min)."
   - "Extended FooService instead of creating BarService to avoid duplicating the auth logic."
3. **Files modified**: Grouped by purpose (implementation, tests, config, docs).
4. **Suggested next steps**: What follow-up work does this enable or require?
   - "The new validation schema should be extended when we add field X in Phase 3."
   - "Performance testing under load hasn't been done yet — recommend before launch."
5. **Verify all tests pass** one final time using the `verification` skill.

**Exit gate**: Summary is delivered. All tests pass. Feature is ready for merge or PR.

## Done
feature-development done — feature implemented, tested, reviewed, and ready for merge; status: DONE
