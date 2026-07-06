---
name: rationalization-prevention
user-invocable: false
description: 'Use when the urge arises to skip a verification, downgrade a finding, or defer a check — that urge is a rationalization; name it and do not act on it.'
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  trigger: [good enough, skip, later, not worth, edge case, unlikely]
  tags: [rule, priority, rigor, discipline]
  aliases: [anti-rationalization, don't skip the check]
---

# rationalization-prevention

## The rule

Under pressure, the mind invents plausible reasons to skip the right step. Spot the rationalization pattern. Name it. Don't act on it. If the pattern is legitimate, it will survive being named.

## When to use

- About to skip a verification command, code-review step, or plan-writing phase.
- About to downgrade a finding from "blocker" to "nice-to-have" without new evidence.
- About to defer work you were about to do because "it's not really related."

## Red flags (thoughts that mean STOP)

| Thought | Reality |
|---|---|
| "This edge case is unlikely" | Unlikely is the top cause of outages. |
| "I'll fix it later" | Later = never. Fix it now or file it with an owner. |
| "The user probably won't notice" | Users always notice the thing you skipped. |
| "It's not in scope" | Scope drift is a decision — make it one, not a drift. |
| "I'm tired, I'll come back to it" | Tired-future-you is the same rationalizer. |

## Exit condition

Either the original step is completed, or the rationalization is written down in the commit message / PR description / work log with a concrete reason a human can challenge.

## Why

Every incident has a postmortem that contains a rationalized skip. This rule makes the skip visible at the moment it happens, when it is still cheap to reverse.
