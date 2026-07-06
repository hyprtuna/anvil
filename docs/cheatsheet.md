# Anvil Cheatsheet

One-page reference for the CLI and slash commands. Every row lists both forms —
they share the same implementation.

## Install / verify

| CLI | Slash | What it does |
|---|---|---|
| `anvil init --target both` | — | Install Anvil into the current project |
| `anvil doctor` | `/doctor` | Verify manifest, parity, models, hooks |
| `anvil doctor --fix` | `/doctor --fix` | Auto-repair common drift |
| `anvil upgrade` | `/upgrade` | Pull the latest Anvil and re-run doctor |
| `./uninstall.sh` | — | Remove Anvil without needing a working CLI |

## Core workflow

| CLI | Slash | What it does |
|---|---|---|
| `anvil plan <topic>` | `/plan <topic>` | Design a plan before touching code |
| `anvil start-research <topic>` | `/start-research <topic>` | 3-phase research producing RESEARCH.md |
| `anvil tdd <feature>` | `/tdd <feature>` | RED → GREEN → REFACTOR loop |
| `anvil debug <issue>` | `/debug <issue>` | 4-phase systematic debugger |
| `anvil review` | `/review` | Dispatch code-reviewer agent |
| `anvil verify` | `/verify` | Run tests + build + lint |
| `anvil explore <question>` | `/explore <question>` | Dispatch code-explorer |
| `anvil ultra <task>` | `/ultra <task>` | 6-phase ultra-worker execution loop |
| `anvil quick <task>` | `/quick <task>` | Ad-hoc task without full planning |
| `anvil discuss <topic>` | `/discuss <topic>` | Structured decision capture |
| `anvil finish` | `/finish` | Graceful branch completion |

## Session & progress

| CLI | Slash | What it does |
|---|---|---|
| `anvil progress` | `/progress` | Branch + commits + next-action |
| `anvil pause` | `/pause` | Save work state to `.anvil/handoff.json` |
| `anvil resume` | `/resume` | Restore from handoff |
| `anvil revise-claude-md` | `/revise-claude-md` | Capture session learnings into CLAUDE.md |

## Skills & models

| CLI | Slash | What it does |
|---|---|---|
| `anvil skill list` | `/skill list` | Show all loaded skills |
| `anvil skill search <q>` | `/skill search <q>` | Tag/alias/description fuzzy search |
| `anvil skill validate <name>` | `/skill validate <name>` | Frontmatter + content check |
| `anvil skill eval <name>` | `/skill eval <name>` | Run the fixture suite, report score |
| `anvil skill enable/disable <name>` | — | Toggle in config |
| `anvil models list` | `/models` | Show model defaults |
| `anvil models set <group> <model>` | — | Override a model group |
| `anvil models use <preset>` | — | Apply a preset |
| `anvil models reset` | — | Restore the default preset |

## MCP & agents

| CLI | Slash | What it does |
|---|---|---|
| `anvil mcp new <name>` | — | Scaffold a Model Context Protocol server | <!-- doc-drift: skip -->
| `anvil agents` | `/agents` | List configured agents |

## PR & git

| CLI | Slash | What it does |
|---|---|---|
| `anvil pr` | `/pr` | Create a PR from the current branch |

## Environment variables

| Var | Values | Effect |
|---|---|---|
| `ANVIL_HOOK_PROFILE` | minimal / standard / strict | Gate which advisory hooks fire |
| `ANVIL_MODEL_OVERRIDE` | any model id | Force this model for every group |
| `ANVIL_FORCE_NODE` | 1 | Skip Bun runtime even if available |

## Global flags (where supported)

| Flag | Effect |
|---|---|
| `--dry-run` | Print what would happen, write nothing |
| `--yes, -y` | Skip confirmation prompts |
| `--verbose` | Emit debug-level logging |
| `--json` | Per-command machine-readable output (where supported) |
| `--output text\|json` | Global format selector. `--output json` is equivalent to `--json` and applies to every command that produces a result |

## JSON output contract

Anvil emits JSON on stdout when either the per-command `--json` flag or the
root `--output json` flag is set. Both surfaces are equivalent:

```
anvil doctor --json            # per-command flag
anvil --output json doctor     # global flag (Plan 28 E3)
```

Commands that support JSON output and the rough payload shape:

| Command | Shape |
|---|---|
| `anvil doctor` | `Check[]` — `{ name, status: 'pass'\|'warn'\|'fail', detail }` |
| `anvil upgrade --dry-run` | upgrade plan object |
| `anvil uninstall --dry-run` | uninstall plan object |
| `anvil models list` | `Row[]` — skill + resolved model |
| `anvil models show <skill>` | resolution trace object |
| `anvil hooks list` | `Hook[]` — name, kind, enabled, priority |
| `anvil skill list` | `Skill[]` — name, group, language, tier, resolvedModel |
| `anvil skill search <q>` | filtered `Skill[]` |
| `anvil skill select <prompt>` | routed `Skill[]` (most-relevant first) |
| `anvil skill eval <name>` | fixture/rubric score object |
| `anvil agents <task>` | `{ agent, resolvedModel, prompt }` |
| `anvil progress` | branch + commits + next-action object |
| `anvil route <prompt>` | routing decision (intents, skills, agent) |

Invalid `--output` values (anything other than `text` or `json`) exit with
status 1 and an error on stderr.

See also: [features.md](./features.md), [getting-started.md](./getting-started.md), [workflow-guide.md](./workflow-guide.md).

## Two-stage code review (v0.6.0)

The `code-reviewer` agent runs two sequential passes. Pass 1 (spec compliance)
must pass before Pass 2 (code quality) runs. A spec failure halts the review
immediately — code quality is skipped and marked `skipped: true` in the report.

```
anvil review [target] [--type spec-compliance|code-quality|both]
```

| `--type` value | Effect |
|---|---|
| `both` (default) | Run Pass 1, then Pass 2 if Pass 1 passes |
| `spec-compliance` | Run Pass 1 only |
| `code-quality` | Run Pass 2 only (skip spec check) |

The output is a `ReviewReport` JSON block with two `ReviewPass` objects
(`spec_compliance` and `code_quality`), each containing typed findings.

**Confidence threshold:** defaults to 80. Only findings with `confidence >= 80`
are reported. The threshold is noted in the report as `min_confidence`.

**CI integration:** check `summary.critical > 0` to fail the build. The
`SPEC_PASS` / `QUALITY_PASS` sentinels in subagent-executor gate task completion.

## Plan auditing (v0.6.0)

`anvil plan-audit` runs the `plan-verifier` agent against a plan file and emits
a structured `PlanAuditReport` listing gaps, scope creep, ambiguities, missing
edge cases, and hidden assumptions.

```
anvil plan-audit <plan-file>           # emit report to stdout
anvil plan-audit <plan-file> --json    # machine-readable PlanAuditReport
```

`plan-verifier` emits:
- `gaps` — tasks that are missing or under-specified.
- `scope_creep` — items likely to balloon scope.
- `ambiguities` — unclear requirements.
- `missing_edge_cases` — error paths not covered by the plan.
- `overall_risk: low | medium | high`.

The orchestrator runs `plan-verifier` automatically after `plan-writer` and
before `subagent-executor`. For adversarial reviews of high-stakes diffs, use
`anvil review --strict-review` which dispatches the `strict-reviewer` agent.

## Validation coverage (v0.6.0)

Before implementation, map every plan task to a test command.

```
anvil plan-validate-coverage <plan-file>           # write *-validation.md
anvil plan-validate-coverage <plan-file> --json    # emit ValidationMap JSON
anvil plan-validate-coverage <plan-file> --fix     # scaffold missing test stubs
```

`subagent-executor` and `anvil ultra` refuse to run a plan with no
`*-validation.md` file alongside it. Override with `--no-coverage-gate` (CI
escape hatch only).

For plans executed before this tooling existed, use:

```
anvil agents retroactive-validator <plan-file>
```

This audits the current codebase and fills in the validation map retroactively.

## Decision coverage (v0.6.0)

Plans and specs can declare a `<decisions>` block listing significant
architectural choices. `anvil plan-check-decisions` verifies every decision id
is referenced by at least one task.

**`<decisions>` block syntax (in any plan or spec `.md`):**

```markdown
<decisions>
- id: auth-strategy
  title: Use JWT over session cookies
  rationale: Stateless; works across microservices.

- id: db-choice
  title: PostgreSQL over MongoDB
  rationale: Relational data; team expertise; ACID.
</decisions>
```

**CLI:**

```
anvil plan-check-decisions <plan-file>            # soft warn on uncovered decisions
anvil plan-check-decisions <plan-file> --strict   # exit 1 if any decision uncovered
anvil plan-check-decisions <plan-file> --json     # emit DecisionCoverageReport
```

## SDD workflow (v0.17.0)

`sdd-workflow` is a composite skill that orchestrates the full
spec-driven development cycle: spec → plan → implement. Invoke it at
the start of any non-trivial feature. Parallel to TDD.

```
/sdd-workflow <goal>             # run full SDD cycle (spec → plan → implement)
/brainstorm-spec <goal>          # run brainstorm-spec skill directly (spec only)
/brainstorm-spec <goal> --assumptions-first   # skip Q&A; scan codebase and auto-generate
```

`sdd-workflow` gates hard: plan-writing is not invoked until the spec is
explicitly approved. Each phase (spec, plan, implement) is committed separately.

`--assumptions-first`: scans the codebase, generates assumptions, asks only for
corrections. Fastest path to a valid spec.

The output is a spec file with context, scope, `<decisions>` block,
and open questions. plan-writing references this file; decision IDs carry
through to task coverage.

Spec template: `templates/spec.md` (shipped with `anvil init`).

## Parallel orchestration (v0.6.0)

The orchestrator can fan out N background agents concurrently. Results are
written to `.anvil/background-results.md` and merged by the
`read-background-results` skill.

```
anvil orchestrate <goal> --parallel=N   # spawn N background agents
anvil orchestrate <goal> --parallel=3   # common: 3 concurrent agents
```

Slash parity: `/orchestrate <goal> --parallel=N`.

The orchestrator uses `@parallel N` in its task lists to trigger the pool. Each
agent writes its output as a named section in `.anvil/background-results.md`.

## Session model override (v0.6.0)

Switch the active model mid-session without restarting.

```
anvil model <model-id>                   # override for this session
anvil model <model-id> --effort <level>  # with effort level
anvil model reset                        # clear session override
```

Slash parity: `/model <id>`.

State is written to `.anvil/active-model.json` (gitignored). The model
resolver's ENV layer reads this file and applies it as the session override,
above the `models.json` group defaults but below explicit CLI `--model` flags.

## Skill versioning (v0.6.0)

Skills can declare a `version` field in their frontmatter:

```yaml
version: "1.2.0"
breaking_changes_in: ["1.0.0", "1.1.0"]
replacement: "new-skill-name"   # if deprecated
```

`anvil doctor` warns when a skill's version is below a pinned version in
`models.json`, when a skill declares `replacement` (deprecated), or when
`breaking_changes_in` lists a version the user has not re-evaluated.

Pin a version in `models.json`:

```json
{
  "skill_pins": {
    "code-review": "1.1.0"
  }
}
```

Per-skill `eval_fixtures` in frontmatter let `anvil skill eval <name>` run
without a separate YAML file — declare inputs, expected keywords, and a minimum
score directly in the skill's frontmatter.

## Sub-skills — tree composition (v0.9.0)

Skills can declare an ordered list of child skills in frontmatter. The runtime schedules each child before the parent body runs. The parent body synthesises the children's outputs into a unified result.

```yaml
# skills/universal/ui-design.md (canonical example)
sub_skills:
  - color-palette-designer
  - typography-pairings
  - style-chooser
```

Rules:
- `sub_skills` and `chains` are **mutually exclusive** on the same skill — the loader rejects skills that declare both.
- Children remain independently invocable; being a sub-skill child is additive.
- Missing children append a `defects[]` entry on the parent (degraded mode, logs a warning).
- Cycles (`a → b → a` or longer) throw `SkillCycleError` at startup.

`anvil doctor` reports: count of skills with `sub_skills`, degraded skills, and cycles found.

## Output schema on agents (v0.9.0)

Four verifier agents declare `output_schema:` in their frontmatter. The runner validates their output at the return boundary. Schema mismatch marks the result `DONE_WITH_CONCERNS` — never blocking.

| Agent | Schema |
|---|---|
| `code-reviewer` | `ReviewReport` |
| `plan-verifier` | `PlanAuditReport` |
| `spec-reviewer` | `ReviewReport` (`review_type: spec-compliance`) |
| `code-quality-reviewer` | `ReviewReport` (`review_type: code-quality`) |

See `agents/CLAUDE.md` for the list of deliberately schema-free agents (orchestrator, ultra-worker, framework-selector, researcher, language developers).

## Statusline template (v0.9.2)

Switch between the rich truecolor renderer (default) and the simpler v0.9.1 bar.

```
anvil statusline template          # print active template (rich or simple)
anvil statusline template rich     # truecolor RGB-gradient render (default)
anvil statusline template simple   # compact render (v0.9.1 style)
```

Slash parity: `/anvil:statusline-template [rich|simple]`.

The `rich` template renders: 20-block RGB-gradient context bar, `🟢⚡🔥🚨`
emoji scaling, 7d/5h Week's Usage windows, `+N -M` code velocity, `🌿 branch`,
`🤖 model · effort`.

## Statusline install (v0.9.1)

Wire Anvil's statusline into any scope of Claude Code `settings.json`.
As of v0.9.1 the default scope is `global` (was `project` in v0.9.0).

```
anvil statusline install                              # global scope, TS renderer (default)
anvil statusline install --scope global               # write to ~/.claude/settings.json
anvil statusline install --scope project              # write to <cwd>/.claude/settings.json
anvil statusline install --scope global --mode anvil  # TS renderer (default)
anvil statusline install --scope global --mode shell-script  # copy truecolor bash template
anvil statusline install --force                      # overwrite custom statusLine.command
```

Slash parity: `/anvil:statusline-install [--scope global|project] [--mode anvil|shell-script] [--force]`.

**Migration from a custom `.sh`:** if your `~/.claude/settings.json` already points at a
hand-written `statusline-command.sh`, run:
```
anvil statusline install --scope global --mode shell-script --force
```
This replaces your script with the v0.9.0 truecolor-RGB-gradient template (20-block context
bar, green→yellow→red gradient, emoji, 7d/5h windows, velocity, branch, model) and re-wires
the `settings.json` command to point at the new location.

`anvil doctor` detects drift: when `statusLine.command` in either project or global scope
points to a non-anvil script, a `warn` row appears with the migration command.

## Statusline tier (v0.8.0)

Switch the statusline display density without hand-editing `models.json`.

```
anvil statusline tier                    # print current tier (default: default)
anvil statusline tier minimal            # compact: model + effort only
anvil statusline tier default            # adds 7d Week's Usage + ctx%
anvil statusline tier maximal            # full cost + all rate-limit windows
```

Slash parity: `/anvil:statusline-tier [minimal|default|maximal]`.

The `default` tier now surfaces two additional segments: `7d:<pct>(<reset>)` (7-day
Week's Usage window) and `ctx:<pct>` (context-window percentage). Cost (`$$`) remains
maximal-only by default.

`anvil doctor` shows the active tier as a row in the statusline section.

## Lazy skill loading (v0.8.0)

Opt-in manifest size reduction. Enable in `~/.anvil/models.json`:

```json
{
  "skills": { "lazy_load": true }
}
```

With `lazy_load: true`, skill bodies are not read at startup — only frontmatter is
loaded. Body is fetched on first access and memoised. Result: ~50% smaller manifests
for both CC and OC, ~2.7× faster startup.

To force eager loading for a single invocation (for measurement):

```
anvil --eager doctor        # loads all skill bodies regardless of config
```

`anvil doctor` shows a "Skill loading mode" row (`eager` or `lazy`) plus the memoised
body-fetch count for the current process.

## Output compression (v0.8.0)

When a tool result exceeds the word threshold, the hook replaces it with a mechanical
summary and stashes the raw output to the per-branch notepad.

Configure in `~/.anvil/models.json`:

```json
{
  "compression": {
    "threshold_words": 5000,
    "strategy": "summary"
  }
}
```

| Key | Values | Default | Effect |
|---|---|---|---|
| `threshold_words` | positive integer | `5000` | Word count gate before compression fires |
| `strategy` | `summary` \| `diffstat` \| `skip` | `summary` | How to compress |

- `summary` — mechanical summary: file paths, error class names, head/tail lines.
- `diffstat` — for unified diffs; reports hunk counts and changed files only.
- `skip` — advisory mode; hook fires but leaves the output intact.

Raw outputs are stashed at `.anvil/notepads/<branch>/large-outputs.md`. Retrieve via:

```
anvil notepad read --section large-outputs
```

`anvil doctor` shows a "Compression hook" row with threshold, strategy, and stash size.

> **v0.9.0:** `compression.strategy: 'summary'` now invokes the `summarizer` skill via subprocess
> (`bun → tsx → node` fallback). The subprocess is spawned by the hook handler; `anvil skill run summarizer`
> is the underlying mechanism. If the subprocess fails, the mechanical summary (file paths + error names +
> head/tail) is used as the fallback — output is never lost.
> `anvil doctor` shows a "Subprocess runtime" row reporting which runtime was detected.

## Cascading fallback chain (v0.8.0)

`fallback_chain` is now supported on all three `models.json` layers: `ModelDefaults`,
`ModelGroup`, and `ModelOverride`. The resolver picks the highest-precedence layer
that defines a non-empty chain.

```json
{
  "defaults": {
    "fallback_chain": ["balanced", "fast"]
  },
  "groups": {
    "cost-optimised": {
      "model": "claude-haiku-4-5",
      "fallback_chain": ["fast"]
    }
  }
}
```

`anvil model resolve <name>` now prints the resolved `fallback_chain` alongside the
primary model and the source layer for each. When the output shows `Chain consumption: live`,
the runner will actively retry through the chain on `model_not_available` or
`rate_limit_exceeded` errors (capped at 2 retries = 3 attempts total). The original error
surfaces after the cap is exhausted.

**Recovery for moved/deleted source repos:** if your Anvil source tree was deleted (e.g. a worktree
was removed), the user-facing shims at `~/.anvil/bin/` will still work — they resolve
`~/.anvil/runtime/` instead of the source path. If the runtime mirror is also missing, run:

```
curl -fsSL https://raw.githubusercontent.com/<org>/anvil/main/install.sh | bash
```

See `docs/installation.md#recovery` for the full recovery procedure.

## OpenCode standing instructions (v0.8.0)

On `anvil init --target opencode` or `--target both`, the installer writes an
`<!-- anvil-routing -->` block to the repo-root `AGENTS.md`. This gives OpenCode
sessions the same routing preferences that `.claude/rules/anvil-routing.md` provides
for Claude Code sessions.

The block is marker-fenced — re-running the installer updates it in place without
touching user content outside the markers. `anvil uninstall` removes it on opt-in.

`anvil doctor` shows an "AGENTS.md routing block (OpenCode standing instructions)" row.
