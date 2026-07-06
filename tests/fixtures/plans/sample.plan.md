---
executable_plan:
  version: v0.14.0
  theme: Sample plan fixture for parser tests
  tasks:
    - id: A1
      title: First task
      type: feature
      effort: s
---

# Sample plan

Fixture consumed by `tests/unit/core/plans/parse.test.ts` to exercise
`parseExecutablePlanFromFile` against a real on-disk plan file.
