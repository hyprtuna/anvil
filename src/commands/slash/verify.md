---
name: verify
description: Run post-implementation verification — tests, build, lint
argument-hint: "[--phase N]"
---

Run verification checks on the current state or a specific phase. Executes the `verification` skill to ensure all completion claims have fresh evidence.

1. If `--phase N` is provided, extract testable deliverables from that plan phase.
2. Otherwise verify current state: run tests, typecheck, lint check.
3. Load the `verification` skill + resolved model.
4. Walk through verification and report structured results.
5. Exit 0 on all checks passing, exit 1 on any failure.

## Equivalent CLI

`anvil verify [--phase N]`
