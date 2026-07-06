---
name: go-coding
user-invocable: false
description: 'Use when implementing or modifying Go code — idiomatic Go, errors as values, small interfaces.'
tools: [Read, Write, Edit, Grep, Glob, Bash]
x-anvil:
  kind: atomic
  group: development
  trigger: [go, golang, implement]
  language: go
---

> **Invoke via `Skill({skill: "anvil:go-coding"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Go Developer

Idiomatic Go: errors are values, returned not thrown. `context.Context` as first parameter. Interfaces are small and defined by consumers. Package names are short and match directory names.

## Tool Detection

- `go.mod` present -> Go modules project. Use `go build`, `go test`, `go vet`.
- Check `go.mod` for Go version (`go 1.22`) to determine available language features.
- `Makefile` -> use `make` targets for build, test, lint when defined.
- `golangci-lint` config (`.golangci.yml`) -> run `golangci-lint run` for linting.
- `gofumpt` or `goimports` -> use for formatting; otherwise `gofmt`.

## Effective Go Idioms

- Accept interfaces, return structs. Define interfaces at the call site, not the implementation.
- Keep interfaces small: 1-2 methods. `io.Reader`, `io.Writer` are the gold standard.
- Use `func NewFoo(opts ...Option) *Foo` (functional options) for configurable constructors.
- Embed interfaces for composition: `type ReadWriteCloser struct { io.Reader; io.Writer; io.Closer }`.
- Prefer `var ErrNotFound = errors.New("not found")` sentinel errors over string comparisons.
- Use `context.Context` as the first parameter, never store it in a struct.

## Error Handling

- Always check returned errors. Never `_ = doSomething()` if the function returns an error.
- Wrap errors with context: `fmt.Errorf("loading config: %w", err)` — use `%w` for wrapping.
- Use `errors.Is(err, ErrNotFound)` and `errors.As(err, &target)` for inspection.
- Never `panic()` for expected error conditions. Reserve `panic` for truly unrecoverable bugs.
- Return `error` as the last return value. Return early on error — avoid deep nesting.

## Common Pitfalls

- **Goroutine leaks**: Every goroutine must have a clear exit path. Use `context.WithCancel` or `done` channels.
- **Nil map writes**: `var m map[string]int; m["key"] = 1` panics. Always initialize: `m := make(map[string]int)`.
- **Range variable capture** (pre-1.22): `for _, v := range items { go func() { use(v) }() }` captures the loop variable. In Go <1.22, shadow it: `v := v`.
- **Interface pollution**: Don't define interfaces preemptively. If there's only one implementation, use the concrete type.
- **Goroutine + WaitGroup mismatch**: Always `wg.Add(1)` before `go func()`, and `defer wg.Done()` as the first line inside.

## Testing

- Use stdlib `testing` package. Run with `go test ./...`.
- Table-driven tests are the standard pattern:
  ```go
  tests := []struct{ name string; input int; want int }{ ... }
  for _, tt := range tests { t.Run(tt.name, func(t *testing.T) { ... }) }
  ```
- Use `t.Helper()` in test helper functions so failures report the caller's line.
- Use `t.Parallel()` for tests that don't share state — speeds up test suites.
- `testify/assert` and `testify/require` for readable assertions if the project already uses them; otherwise prefer stdlib.
- Integration tests: use build tags (`//go:build integration`) or `testing.Short()` to skip.

## Project Structure

- `cmd/<binary>/main.go` — entry points. Each binary gets its own directory.
- `internal/` — private packages that cannot be imported by external modules.
- `pkg/` — public library code (optional; many projects skip this and put packages at root).
- Keep `main.go` thin: parse flags, wire dependencies, call `run()` which returns an error.
- One package per directory. Package name = directory name (lowercase, no underscores).

## Concurrency

- Prefer `sync.WaitGroup` for fan-out/fan-in of a known number of tasks.
- Use channels for communication, mutexes for state protection. Don't mix without reason.
- `context.Context` propagation: pass it through the entire call chain for cancellation and deadlines.
- Use `errgroup.Group` (`golang.org/x/sync/errgroup`) for concurrent tasks that can fail.
- Prefer `sync.Once` for lazy initialization over manual locking.
