---
name: go-patterns-rules
user-invocable: false
description: 'Use when editing Go code — context.Context first arg, errors.Is/As, defer cleanup, slog.'
tools: []
paths: ['**/*.go']
license: MIT
x-anvil:
  kind: meta
  group: rules
  language: go
---

> **Invoke via `Skill({skill: "anvil:go-patterns-rules"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Go Patterns

**Announce:** I'm using the go-patterns-rules skill to inject Go patterns guidance for this edit.

## Status

Ready to apply.

## Rules

- **context.Context as first argument on cancellable functions** — any function that does I/O must accept `ctx context.Context` and respect its deadline and cancellation.
- **Use errors.Is() and errors.As() for error checking** — avoid `==` or type assertions; use the `errors` package for robust error inspection.
- **defer for cleanup operations** — defer resource cleanup (close, unlock, cleanup) immediately after allocation; prevents leaks on early return.
- **Use channels for concurrency, sync primitives only when necessary** — prefer goroutines and channels; use `sync.Mutex`, `sync.WaitGroup` only when channels don't fit.
- **slog for structured logging** — use `log/slog` (Go 1.21+) instead of `fmt.Printf` or `log` package; enables structured, queryable logs.
- **Avoid global state** — pass dependencies via function parameters or struct fields; global state complicates testing and concurrency.
- **Prefer composition over embedding for behavior** — use named fields instead of embedded types to avoid unexpected method promotion.

## Why

Context first enables graceful shutdown and deadline propagation. errors.Is/As work with wrapped errors. defer ensures cleanup even on panic. Channels make concurrent Go safe and deadlock-free. slog enables observability at scale. Avoiding globals enables testing and parallelism. Composition avoids name collisions and makes dependencies explicit.

## Done — status: DONE
