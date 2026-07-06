---
name: go-testing-rules
user-invocable: false
description: 'Use when editing Go test code — table-driven tests, t.Run, -race flag, httptest.'
tools: []
paths: ['**/*_test.go']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: go
---

> **Invoke via `Skill({skill: "anvil:go-testing-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Go Testing

**Announce:** I'm using the go-testing-rules skill to inject Go testing guidance for this edit.

## Status

Ready to apply.

## Rules

- **Table-driven tests** — structure tests as a slice of test cases with name, input, expected output; loop over the slice to test multiple scenarios.
- **t.Run(name, func(t *testing.T)) for sub-tests** — use subtests to organize related cases; enables `-run pattern` filtering and parallel execution.
- **-race flag in CI** — run tests with `go test -race` in continuous integration to detect data races.
- **testing.T.TempDir() for filesystem fixtures** — use TempDir() instead of creating temp files manually; auto-cleanup on test completion.
- **httptest for HTTP handlers** — use `httptest.NewRecorder()` and `httptest.NewRequest()` to test handlers in isolation; avoid real network calls.
- **Benchmark with Benchmark* and b.N** — write benchmarks as `BenchmarkFoo(b *testing.B)` with a loop over `b.N`; run with `go test -bench`.
- **t.Parallel() for independent tests** — mark independent tests with `t.Parallel()` to enable parallel execution and find race conditions.

## Why

Table-driven tests reduce boilerplate and improve coverage. Subtests organize related cases and enable filtering. The -race flag catches data race bugs that are hard to spot manually. TempDir ensures cleanup. httptest provides realistic request/response testing. Benchmarks enable performance regression detection. Parallel tests increase confidence in concurrent correctness.

## Done — status: DONE
