---
name: one-percent-rule
user-invocable: false
description: 'Use when a skill might apply — if there''s even a 1% chance a skill fits the task, invoke it. Err on the side of over-invocation.'
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  trigger: [skill, invoke, maybe, probably not, overkill]
  tags: [rule, priority, skills]
  aliases: [when in doubt use the skill]
---

# one-percent-rule

## The rule

If there is even a 1% chance that a named skill applies to what you're doing, invoke it. Checking is cheap. Guessing wrong is expensive. The cost of a misfire is seconds; the cost of silent drift is compound.

## When to use

- About to answer a user question without checking for an applicable skill.
- About to implement a feature, fix a bug, review code, or plan anything.
- Faced with a task that is routine or familiar — especially then.

## Red flags (thoughts that mean STOP)

| Thought | Reality |
|---|---|
| "It's just a small change" | Small changes drift. Skills prevent drift. |
| "I already know how to do this" | Knowing ≠ doing it consistently. |
| "This skill is overkill" | Overkill is cheap. Under-discipline is expensive. |
| "I'll check the skill later" | Later never arrives in practice. |
| "The skill doesn't exactly fit" | Partial fit > no fit. Read it; adapt. |

## Exit condition

You have either (a) invoked the relevant skill via the Skill tool, or (b) explicitly declared and justified why it does not apply. A silent skip is a violation.

## Why

The entire point of shipping skills is consistency under pressure. When you're rushed, the 1% rule is what turns a good plan into a followed one. Without it, skill adoption drops the moment the work gets interesting.
