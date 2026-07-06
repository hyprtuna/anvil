# Anvil tiers

## Overview

Tiers are task-typed, not model-typed. Each tier names a class of work — `quick` for read-only operations, `coding` for implementation, `review` for audit, `planning` for architecture, `ultra` for autonomous execution, `super` for explicit human-stakes escalation. The tier resolves to a model alias (`cheap`, `balanced`, or `best`) plus an effort level; those aliases are then translated to a concrete model by the model-resolution chain. This indirection makes tiers provider-portable: override three alias mappings in `~/.anvil/models.json` and all six tiers automatically track to the new provider's models.

## The six tiers

| Tier | Model alias | Effort | Use for |
|---|---|---|---|
| `quick` | `cheap` (Haiku) | (none) | Git ops, GH ops, file listing, simple edits, status, doc edits |
| `coding` | `balanced` (Sonnet) | medium | Feature dev, fixes, tests, scaffolding, MCP building |
| `review` | `balanced` (Sonnet) | high | Code review, doc verification, test analysis, simplification |
| `planning` | `best` (Opus) | high | Architecture, planning, brainstorming, framework selection |
| `ultra` | `best` (Opus) | xhigh | Autonomous execution, deep research, security audit, silent-failure hunt |
| `super` | `best` (Opus) | max | Explicit human-stakes escalation; the highest setting Anvil ships |

## Effort support per model

| Model | Supported efforts (low to high) |
|---|---|
| Haiku (`claude-haiku-4-5`) | (none — effort is silently dropped) |
| Sonnet (`claude-sonnet-4-6`) | `low`, `medium`, `high`, `max` |
| Opus (`claude-opus-4-7`) | `low`, `medium`, `high`, `xhigh`, `max` |

If you set an effort outside a model's supported range, Anvil's resolver clamps to the highest supported level at or below your value (matching Claude Code's behavior). Haiku silently drops effort entirely.

## Tier injection

Tiers reach the model resolver through three mechanisms:

**CLI flag** — pass `--tier=<name>` to any tier-aware command:

```bash
anvil review --tier=ultra docs/anvil/features/X/spec.md
```

**Dispatch param (orchestrator pattern)** — when an orchestrator fans out subagents, each dispatch envelope carries a `tier` field so different tasks run at the right cost level:

```yaml
# orchestrator dispatch — varied tiers per task type
- agent: code-explorer
  tier: quick           # read-only; Haiku is sufficient
- agent: code-reviewer
  tier: review          # full audit; Sonnet + high effort
```

**Skill body convention** — agents declare their default tier in frontmatter (`tier: planning`), which the runner resolves at load time. The `agents/orchestrator.md` and `agents/ultra-worker.md` skill bodies document the tier-dispatch convention for subagent runs.

## Conflict resolution

`--model` wins over `--tier`. When both are present the resolver uses the explicit model and ignores the tier's model alias, but still applies the tier's effort level unless `--effort` is also set. The resolver logs a `tier_overridden_by_model` warning to the trace.

Example: `anvil ultra --tier=planning --model=claude-sonnet-4-6` runs Sonnet at `high` effort (planning's effort) and logs the override.

## Provider portability via alias override

All six tiers reference the three short aliases — `cheap`, `balanced`, `best` — rather than concrete model IDs. To switch providers, override those aliases in `~/.anvil/models.json`:

```json
{
  "model_aliases": {
    "cheap": "kimi-k2-base",
    "balanced": "kimi-k2-instruct",
    "best": "kimi-k2-think"
  }
}
```

All six tiers automatically resolve to the new provider's models — no per-tier override needed. The same pattern works for OpenAI, GLM, or any other provider with compatible model IDs.

## When to use which tier

- `quick` — Use for read-only or file-system/git/GH operations where Haiku is sufficient and speed matters.
- `coding` — Default for feature implementation, fixes, and test writing; Sonnet at medium effort balances quality and cost.
- `review` — Use for any review or audit task where Sonnet at high effort meaningfully improves catch rate over medium.
- `planning` — Use when proposing architecture or writing a plan that another agent will execute; Opus raises ceiling for cross-cutting decisions.
- `ultra` — Use for fully autonomous execution where the cost of a wrong decision is high; Opus at xhigh sustains deep reasoning over many steps.
- `super` — Reserve for explicit human-stakes escalation (security audits, irreversible operations); max effort, no further override.
