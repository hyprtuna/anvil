---
name: codebase-onboarding
user-invocable: false
description: 'Use when onboarding to a new codebase — produces an architecture map, key entry points, conventions, and a starter CLAUDE.md.'
tools: [Read, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: exploration
  trigger: [onboard me, understand this codebase, generate CLAUDE.md, new project, walk me through]
  language: universal
---

# Codebase Onboarding

Systematically analyze an unfamiliar codebase and produce two artifacts: a structured onboarding guide and a starter `CLAUDE.md`. Designed for the first time Claude Code opens a repo or when a development joins a new project.

## When to Use

- First session in a new project.
- User says "onboard me", "help me understand this codebase", or "generate a CLAUDE.md".
- User wants a ramp-up guide for a new contributor.

## Phase 1 — Reconnaissance

Run these checks in parallel before reading any source files:

1. **Package manifest detection** — `package.json`, `go.mod`, `Cargo.toml`, `pyproject.toml`, `pom.xml`, `build.gradle`, `Gemfile`, `composer.json`
2. **Framework fingerprinting** — `next.config.*`, `angular.json`, `vite.config.*`, Django settings, FastAPI main, Rails config
3. **Entry point identification** — `main.*`, `index.*`, `app.*`, `server.*`, `cmd/`, `src/main/`
4. **Directory snapshot** — top two levels, ignoring `node_modules`, `.git`, `dist`, `build`, `__pycache__`, `.next`
5. **Tooling detection** — linter configs, `Makefile`, `Dockerfile`, `docker-compose.*`, `.github/workflows/`, `.env.example`
6. **Test structure** — `tests/`, `__tests__/`, `*.spec.ts`, `*.test.js`, `pytest.ini`, `vitest.config.*`

Do not read every file. Use Glob and Grep; read selectively only for ambiguous signals.

## Phase 2 — Architecture Mapping

From the reconnaissance data, identify:

- **Tech stack** — language(s), framework(s), database(s), build tools, CI/CD platform
- **Architecture pattern** — monolith / monorepo / microservices / serverless; frontend/backend split; API style
- **Key directories** — top-level directory to purpose mapping
- **Data flow** — trace one request from entry point to response: where it enters, how it is validated, where business logic lives, how it reaches the database

## Phase 3 — Convention Detection

Extract patterns the codebase already follows:

- **Naming conventions** — file casing, component/class naming, test file suffixes
- **Error handling style** — try/catch, Result types, error codes
- **Dependency injection pattern** — or lack thereof
- **Async patterns** — callbacks, Promises, async/await, goroutines, channels
- **Git conventions** — branch naming, commit message style — skip this section if git history is shallow

## Phase 4 — Generate Artifacts

### Onboarding Guide

Produce a structured Markdown guide:

```
## Overview
[2–3 sentences: what the project does and who it serves]

## Tech Stack
| Layer | Technology | Version |
…

## Architecture
[Description or ASCII diagram of how components connect]

## Key Entry Points
[File → purpose table]

## Request Lifecycle
[Trace one API request from entry to response]

## Conventions
[File naming, error handling, testing patterns, git workflow]

## Common Tasks
[Dev server, test, lint, build, migration commands]

## Where to Look
| I want to... | Look at... |
```

### Starter CLAUDE.md

Generate or enhance `CLAUDE.md` based on detected conventions. If one already exists, read it first, then add or correct — never replace existing project-specific instructions.

```
## Tech Stack
## Code Style
## Testing
## Build & Run
## Project Structure
## Conventions
```

## Best Practices

- **Don't read everything** — reconnaissance uses Glob and Grep; Read is for disambiguation only.
- **Verify, don't guess** — if config and code disagree, trust the code.
- **Enhance, don't replace** — existing CLAUDE.md sections are preserved; additions are clearly marked.
- **Stay concise** — the guide should be scannable in two minutes.
- **Flag unknowns** — "Could not determine test runner" is better than a wrong answer.

## Anti-patterns

- Generating a CLAUDE.md over 100 lines — keep it focused.
- Listing every dependency — highlight only the ones that shape how code is written.
- Describing self-evident directory names — `src/` needs no explanation.
- Copying the README verbatim — the guide adds structural insight the README lacks.
