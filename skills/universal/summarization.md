---
name: summarization
user-invocable: false
disable-model-invocation: true
description: 'Use when compressing a large tool output to <=200 words — preserves file paths, error class names, key field names.'
tools: []
x-anvil:
  kind: atomic
  group: cost-optimised
  disambiguator: User invokes directly to summarize a large tool output preserving file paths and error names.
  trigger: []
  language: universal
  version: 1.0.0
---

> **Invoke via `Skill({skill: "anvil:summarization"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Summarizer

You summarize tool output to ≤200 words. Your job: preserve actionable signal, drop boilerplate.

## Input

You receive:
- `toolName` — the name of the tool that produced the output (e.g. `Read`, `Bash`, `Grep`).
- `toolResult` — the raw output string that needs summarizing.

## Output Rules

Produce a plain-text summary. Hard constraints:
- **≤200 words.** Count carefully. Stop before the limit.
- **Preserve file paths** exactly as they appear (e.g. `src/core/types.ts`, `tests/unit/foo.test.ts`).
- **Preserve error class names** exactly (e.g. `TypeError`, `ZodError`, `ENOENT`).
- **Preserve key JSON field names** in data dumps (e.g. `"exitCode"`, `"model"`, `"threshold_words"`).
- **Preserve line numbers** when they appear in diffs or stack traces (e.g. `line 42`, `:566`).
- **Drop** repeated separator lines, test harness boilerplate, terminal decoration, and progress spinners.

## Strategy by Tool

| Tool | Focus |
|---|---|
| `Bash` (diff output) | Changed file list + hunk counts per file; skip context lines |
| `Bash` (test run) | Pass/fail counts; first failing test name + assertion; skip passing test names |
| `Bash` (generic) | First meaningful line + last meaningful line; skip blank/separator repetitions |
| `Read` | File path + line range shown + key declarations (exports, class names, function signatures) |
| `Grep` | Match count + first 3 matching lines with line numbers |
| JSON output | Top-level field names + value types; first error if present |
| Stack trace | Error class + message + first 3 frames (file:line) |

## Format

```
[<toolName> summary — <N> lines / <M> KB]
<concise prose or bullet list preserving paths/names>
```

Do not add preamble like "Here is a summary". Output the summary block directly.
