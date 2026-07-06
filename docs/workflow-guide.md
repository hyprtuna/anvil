# Workflow Guide

A step-by-step walkthrough of the Anvil development lifecycle, from idea to shipped code.

## Phase 1: Brainstorm

Surface decisions, gray areas, and design trade-offs before writing any code.

```bash
anvil discuss "should auth use JWT or sessions?"
```

The brainstormer explores your question from multiple angles, asks clarifying questions, and produces a structured summary of options with trade-offs. Use this whenever you are unsure about direction.

## Phase 2: Research

Investigate options with depth before committing to an approach.

```bash
anvil start-research "OAuth2 PKCE flow" --depth deep
```

Depth levels: `shallow` (quick scan), `normal` (default), `deep` (exhaustive trace across the codebase and related patterns). Research reads the codebase, identifies relevant patterns, and reports findings with file:line references.

## Phase 3: Plan

Create an actionable implementation plan from a goal statement.

```bash
anvil plan "add user authentication with email/password"
```

The planner produces numbered subtasks, each with acceptance criteria, estimated effort, and file paths. Plans are saved to `.anvil/plans/` for later execution.

## Phase 4: Execute

Choose the execution mode that fits the task:

**TDD** -- write tests first, then make them pass:

```bash
anvil tdd "login form component"
```

**Ultra** -- autonomous multi-step execution with subagents:

```bash
anvil ultra "implement the auth plan"
```

**Quick** -- ad-hoc single-step task:

```bash
anvil quick "add a loading spinner to the submit button"
```

Each mode uses the appropriate model from your preset. Ultra dispatches parallel subagents for independent subtasks.

## Phase 5: Review

Run a code review against the current diff.

```bash
anvil review
```

The reviewer checks for correctness, style, security, performance, and test coverage. It produces structured feedback with severity levels and file:line references.

## Phase 6: Verify

Run the full verification suite: tests, build, and lint.

```bash
anvil verify
```

This runs your project's test runner, build command, and linter in sequence. Failures are reported with context. Always verify before shipping.

## Phase 7: Ship

Create a pull request from the current branch.

```bash
anvil pr
```

This generates a PR title and description from the commit history, runs a final verify pass, and opens the PR on GitHub or GitLab.

## Session management

Pause your current session to resume later:

```bash
anvil pause
```

Resume where you left off:

```bash
anvil resume
```

Session state is saved to `.anvil/sessions/`, including the active plan, completed steps, and conversation context.

## Progress tracking

Check progress on the active plan:

```bash
anvil progress
```

This shows completed, in-progress, and remaining subtasks with timestamps.

## Model management

List available models and their assignments:

```bash
anvil models list
```

Switch to a different preset:

```bash
anvil models use max-quality
```

View the full resolution chain for a specific skill:

```bash
anvil models resolve planner
```

The 5-layer resolution chain applies in order: CLI flag, ENV var, per-skill override, group default, global default. See `docs/anvil/specs/2026-04-13-anvil-design.md` for details.
