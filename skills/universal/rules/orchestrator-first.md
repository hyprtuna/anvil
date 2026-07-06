---
name: orchestrator-first
user-invocable: false
description: Use when the router emits a high-confidence directive — delegate to the named agent before handling inline.
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  trigger: [DIRECTIVE, route to, high-confidence routing]
  tags: [routing, delegation, rule, priority]
  aliases: [delegate first, router directive]
---

# orchestrator-first

## The rule

When the routing banner above the prompt is a **directive** (multi-line, confidence ≥ 75%, naming a specific agent), your first action is to delegate to that agent. Do not start reading files, drafting code, or answering inline — dispatch first, then react to what the agent returns.

## When to use

- A multi-line directive block appears above the user's prompt.
- The banner lists a specific agent (not `main`).
- The user has not already invoked a different agent or skill explicitly.

## What "delegate first" means

- Invoke the named agent via the `Task()` / `Agent` tool with the named subagent type.
- Pass the user's prompt verbatim plus the routing preamble (the `[routing]` block under the banner).
- Attach the named skills and rules as context for the agent.
- Resume only after the agent returns a result — do not run interleaved work.

## Carve-outs (inline is OK)

| Situation | Why inline is fine |
|---|---|
| User explicitly invoked a different agent (`@agent`, `/skill`) | Explicit override beats the directive. |
| Task is truly trivial (≤ 1 file, ≤ 10 lines, no verification needed) | Dispatching adds latency with no parallelism benefit. |
| Banner is advisory (single line, no `DIRECTIVE` marker) | Router is not confident enough to force delegation. |
| Banner is `fallback=main` or `fallback=ask` | Router deferred to main / user — do not dispatch. |

## Red flags (thoughts that mean STOP and delegate)

| Thought | Reality |
|---|---|
| "I can just do this myself, it's faster" | Faster for this turn; the directive exists because router evidence says this task class benefits from the specialist. Dispatch. |
| "I'll read the files first to understand, then decide" | Reading *is* doing inline. Dispatch and let the agent read. |
| "The agent would just do what I'd do" | Then dispatching costs nothing and gains consistency. Dispatch. |
| "Directive is probably wrong for this one" | If confidence ≥ 75% the router has evidence. Respect the directive; user can override explicitly. |

## Why

The directive threshold was calibrated so that only high-evidence routes produce it. When it fires, the specialist agent has a structural advantage (tighter prompt, targeted skills, appropriate rules). Overriding the directive silently reverts the session to generalist mode and loses that advantage without the user noticing. Explicit override is fine; silent override is not.

## Decision tree — skill vs agent vs command

If delegating, decide the primitive **first** — never assume.

```
Does this need a fresh context window?           → Agent
Is this a discipline / rule / methodology?       → Skill
Is this a CLI / project-state action?            → Command
```

Slug grammar makes the choice lexically:
- **Agents** end in approved doer-suffixes (`-er`, `-or`, `-architect`, `-builder`, `-worker`, `-explorer`, `-orchestrator`, `-validator`, `-resolver`, `-surfacer`, `-selector`, `-analyzer`, `-simplifier`, `-verifier`, `-reviewer`, `-hunter`).
- **Skills** end in activity-noun forms (`-ing`, `-ion`, `-design`, bare nouns like `research`).
- **Commands** begin with a verb (`init`, `plan`, `review`, `finish`, ...).

If you reach for the Agent tool with an `-ing`-form slug, the slug is telling you to use the Skill tool.
