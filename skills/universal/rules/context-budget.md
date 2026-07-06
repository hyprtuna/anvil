---
name: context-budget
user-invocable: false
description: Use when auditing token overhead across loaded components — produces prioritised savings recommendations before heavy subagent chains.
tools: [Read, Glob, Bash]
x-anvil:
  kind: atomic
  group: rules
  trigger: []
  language: universal
---

# Context Budget

Analyze token overhead across every loaded component and surface the top optimizations to reclaim context headroom. Run this before spawning a long subagent chain or after adding several new components.

## When to Use

- Session quality is degrading or output feels truncated.
- Many skills, agents, or MCP servers were recently added.
- Planning a long multi-agent task and need to know available headroom.
- Orchestrator pre-flight before a complex parallel dispatch.

## Phase 1 — Inventory

Estimate token consumption per component category. Use `words × 1.3` for prose; `chars / 4` for code-heavy files.

**Agents** (`agents/*.md` or `.claude/agents/*.md`)
- Lines and estimated tokens per file
- Flag: description field > 30 words (loaded into every Task tool invocation)
- Flag: files > 200 lines (inflate Task context on every spawn)

**Skills** (`skills/**/*.md`)
- Tokens per skill file
- Flag: files > 400 lines
- Deduplicate identical copies across skill directories

**Rules** (`rules/**/*.md`, `skills/universal/rules/*.md`)
- Tokens per rule file
- Flag: files > 100 lines
- Detect content overlap between rule files in the same category

**MCP Servers** (`.mcp.json` or active MCP config)
- Tool count per server
- Estimated overhead at ~500 tokens per tool schema
- Flag: servers with > 20 tools
- Flag: servers wrapping CLI tools already available as shell commands (`git`, `gh`, `npm`)

**CLAUDE.md chain** (project + user-level)
- Combined token count
- Flag: combined total > 300 lines

## Phase 2 — Classify

Sort every component into one of three buckets:

| Bucket | Criteria | Action |
|---|---|---|
| Always needed | Referenced in CLAUDE.md, backs an active command, or matches current project type | Keep |
| Sometimes needed | Domain-specific but not in active use for this task | Consider on-demand activation |
| Rarely needed | No command reference, overlapping content, no project match | Remove or lazy-load |

## Phase 3 — Detect Issues

| Issue | Threshold | Impact |
|---|---|---|
| Bloated agent description | > 30 words | Loaded on every Task tool call |
| Heavy agent file | > 200 lines | Inflates Task context on every spawn |
| Redundant skill/rule | Duplicate content across files | Silent token waste |
| MCP over-subscription | > 10 servers or CLI-wrapping servers | Often the single largest lever |
| CLAUDE.md bloat | > 300 combined lines | Loaded at session start |

## Phase 4 — Report

```
Context Budget
══════════════════════════════════════
Total overhead:     ~XX,XXX tokens
Effective headroom: ~XXX,XXX tokens (XX%)

Component Breakdown
───────────────────
Agents      N files    ~X,XXX tokens
Skills      N files    ~X,XXX tokens
Rules       N files    ~X,XXX tokens
MCP tools   N tools    ~XX,XXX tokens
CLAUDE.md   N lines    ~X,XXX tokens

Top Optimizations
─────────────────
1. [action] → save ~X,XXX tokens
2. [action] → save ~X,XXX tokens
3. [action] → save ~X,XXX tokens

Potential savings: ~XX,XXX tokens (XX% of current overhead)
```

## Best Practices

- **MCP is the biggest lever** — a 30-tool server costs more than all skills combined.
- **Agent descriptions are always loaded** — even unspawned agents inflate every Task tool context via their description.
- **Audit after every addition** — run after adding any agent, skill, or MCP server to catch creep early.
- **Verbose mode for debugging** — use when you need per-file breakdowns, not for regular audits.
