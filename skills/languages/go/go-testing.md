---
name: go-testing
user-invocable: false
description: 'Use when writing or extending Go tests — table-driven, testing package, -race flag.'
tools: [Read, Write, Edit, Bash, Grep]
x-anvil:
  kind: atomic
  group: testing
  trigger: [test go, go test, test]
  language: go
---

> **Invoke via `Skill({skill: "anvil:go-testing"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Go Tester

Table-driven tests. `testing` package. `go test ./...` as baseline. Use `-race` flag for concurrent code.
