---
name: skill-orchestration
description: MUST consult before any task — checks if a more specific Anvil skill applies
disable-model-invocation: false
user-invocable: false
x-anvil:
  kind: meta
  group: orchestration
  trigger: [any task]
---

> **Invoke via `Skill({skill: "anvil:skill-orchestration"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

<EXTREMELY-IMPORTANT>
If a high-confidence routing directive (Phase A) is already active for this prompt, defer to it — that decision is more specific than this gate.

If you think there is even a 1% chance an Anvil skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF AN ANVIL SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. This is not optional. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## Routing by intent

| Intent | Anvil surface |
|---|---|
| plan / decompose / design | `planning` skill + `code-architect` agent |
| review / audit / quality | `code-reviewer` skill + `code-reviewer` agent |
| debug / fix / failing | `debugging` skill + `ultra-worker` agent |
| test / TDD / coverage | `test-driven-development` skill + `ultra-worker` agent |
| refactor / simplify | `code-simplifier` agent + `slop-removal` skill |
| research / compare | `researcher` skill + `researcher` agent |
| document / readme | `doc-writing` skill + `ultra-worker` agent |
| implement feature | `feature-development` skill + `ultra-worker` agent |
| parallel tasks | `orchestrator` agent |
| MCP server | `mcp-builder` skill/agent |

## Priority order

Explicit user invocation > active routing directive > this gate > inline reasoning.

When in doubt, invoke. The cost of an unnecessary skill check is low. The cost of missing one is high.

## Decision tree — skill vs agent vs command

Before invoking, identify the right primitive. Anvil ships three:

- **Skill (`Skill({skill: "anvil:<slug>"})`)** — a discipline, rule, methodology, or activity playbook. Loaded into the current context window. Use for: the *how* of a workflow.
- **Agent (`Agent({subagent_type: "anvil:<slug>"})`)** — an autonomous worker with its own context window. Spawns a sub-session. Use for: tasks needing fresh context, deep exploration, or parallel fan-out.
- **Command (`anvil <verb>`)** — a CLI action that mutates the project state. Use for: install, doctor, route, plan, finish, and other side-effecting operations.

```
Does this need a fresh context window?           → Agent
Is this a discipline / rule / methodology?       → Skill
Is this a CLI / project-state action?            → Command
```

The slug grammar enforces the choice lexically — agents end in approved doer-suffixes (`-er`, `-or`, `-architect`, `-builder`, ...); skills end in activity-noun forms (`-ing`, `-ion`, `-design`, ...); commands begin with a verb. If you reach for the Agent tool with an `-ing`-form slug, the slug is telling you to use the Skill tool instead.
