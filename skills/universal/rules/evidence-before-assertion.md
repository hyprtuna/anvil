---
name: evidence-before-assertion
user-invocable: false
description: 'Use before writing any claim about code, state, or behavior — claims must cite concrete evidence (file:line, command output, test result), never inference.'
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  trigger: [works, passes, already, confirm, verify, proof]
  tags: [rule, priority, rigor, evidence]
  aliases: [cite it, proof not prose]
---

# evidence-before-assertion

## The rule

<HARD-GATE phase="claim">
Every claim you write about the codebase — that a function exists, that a test passes, that a change is safe — must carry concrete evidence. A file path and line number. A command and its output. A commit hash. A test name. Inference is not evidence.

letter = spirit: the intent of this gate is that every factual claim is *independently verifiable* by the reader, *now*, against the same tree. Citing "I checked earlier" or paraphrasing a prior result satisfies the letter (some checking happened) but violates the spirit (the reader cannot reproduce the verification from your text alone). The reference must be specific enough to retrace.

This gate lifts ONLY when:
- Every factual claim carries a `file:line` reference, command output, commit hash, or test name.
- The reference points at content that exists in the *current* tree, not memory of a prior tree.
- A reader can copy-paste each reference into their own session and reproduce the check.
</HARD-GATE>

## When to use

- Writing a PR description, review comment, commit message, or status update.
- Answering a user question about "does this code do X?"
- Composing any end-of-turn summary with claims about state.

## Red flags (thoughts that mean STOP)

| Thought | Reality |
|---|---|
| "I remember this from earlier" | Memory is unreliable. Re-check the file. |
| "It usually works this way" | Codebases are idiosyncratic. Check this one. |
| "The user said so, so it's true" | User can be wrong or out of date. Verify. |
| "The docs say it does that" | Docs drift from code. Check the code. |
| "I scanned it a minute ago" | Minute-ago memory compressed. Quote the line. |
| "Naming the path is enough — I don't need to read it again" | Paths drift between sessions. Re-grep, then cite. |

## Exit condition

Every factual claim in your output is accompanied by a concrete reference: `src/foo.ts:42`, `rg -n "pattern"` output, `bun test --run foo` result. Claims without references get struck.

## Why

Assertions without evidence create false consensus. The first person to claim "this works" sets the narrative; every downstream reader assumes it. Evidence is the cheap way to prevent that cascade.
