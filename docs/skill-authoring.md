# Skill Authoring Guide

Skills are Markdown files with a YAML frontmatter block. They live in `skills/universal/` (available to all projects) or `skills/languages/<lang>/` (language-specific overlays). The canonical example is `skills/universal/code-review/SKILL.md` (subdir form per the subdir colocates sibling `*-prompt.md` files used by `Task(general-purpose)` dispatches per

## Minimal frontmatter example

```yaml
---
name: my-skill              # required — unique identifier, kebab-case; filename must match
kind: atomic                # required — atomic | composite | meta
group: development          # required — planning, development, review, testing, debug, ops
description: "Use when you need to do X — keywords for routing"  # required, ≤512 chars
trigger: ["keyword", "phrase"]  # intent-router matching signals
preferred_model: balanced   # required — alias (cheap|balanced|best) or full claude-* id
preferred_effort: medium    # required — low | medium | high | xhigh | max
user-invocable: false       # MUST be false for helpers/sub-skills; true only for direct entry points
---
```

The full field reference is in the generated section below.

## Tier precedence

Skills are loaded in three tiers. Higher tiers override lower ones when names conflict:

| Tier | Location | Precedence |
|---|---|---|
| Universal | `skills/universal/` | Lowest |
| Language | `skills/languages/<lang>/` | Middle |
| User | `~/.claude/skills/` or `.claude/skills/` | Highest |

A user skill with the same `name` as a shipped skill fully replaces it.

## Skill body

After the frontmatter, write skill instructions in Markdown. This content is injected into the Claude context when the skill is activated.

**Required structure:**
1. Open with `## Status` announce line: `my-skill starting — <one-line purpose>`.
2. Write the skill body (instructions, constraints, examples).
3. Close with `## Done — status: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`.

```markdown
---
name: example-skill
kind: atomic
group: development
description: "Use when implementing a small, well-scoped feature — plan, code, test"
trigger: ["implement", "add feature", "small feature"]
preferred_model: balanced
preferred_effort: medium
user-invocable: false
---

## Status
example-skill starting — implementing the requested feature

Follow these steps:

1. Read the relevant source files first.
2. Propose a minimal implementation plan.
3. Write the changes, then verify with the test runner.
4. Report what changed and why.

## Done — status: DONE
```

## Validation

Every skill's frontmatter is validated against `SkillFrontmatter` in `src/core/types.ts` at load time. Invalid skills are skipped with an error log. Run `anvil skill validate` to check all installed skills.

## Model resolution

`preferred_model` feeds the 7-layer resolution chain. Precedence: CLI flag → ENV var → agent-override → session file → per-skill override → group default → global default. Use provider-neutral aliases (`cheap`, `balanced`, `best`) in `preferred_model` — never hardcode a concrete model ID.

## Testing your skill

After adding or editing a skill:

```bash
anvil skill validate        # validates frontmatter against SkillFrontmatter schema
anvil skill list            # confirm it appears
anvil doctor                # check user-invocable count and description-budget lints
```

## Output / input templates

Skill bodies should not embed long structural prose (decision shapes, plan
frontmatter, code-review formats, …). Extract that prose into the bundled
`templates/<kind>/` tree and reference it from the skill body via
`${TEMPLATE:<kind>}` substitution.

```yaml
---
name: my-skill
# … other frontmatter …
templates: [decisions, plans]
---

# My Skill

When the user asks for a decision, follow this shape:

${TEMPLATE:decisions}
```

At render time, the loader splices the resolved template content into the
body. Resolution order:

1. **User override** — `~/.anvil/templates/<kind>/<variant>.md` (per-user).
2. **Bundled** — `templates/<kind>/<variant>.md` (shipped with Anvil).

Surface variants (`claude-code.md` / `claude-code.json` / `opencode.md`) win
over `default.md` when the active surface is known. Unknown kinds with no
matching file pass through verbatim — the doctor `templates/embedded-prose-lint`
row flags skills that carry a `<!-- template-prose -->` marker but no
`templates:` frontmatter entry.

For the full convention (kinds list, variant matrix, user-override workflow,
doctor rows), see [`docs/templates.md`](./templates.md).

<!-- gen:start — managed by scripts/generate-authoring-md.ts; do not edit between markers -->

## SkillFrontmatter field reference

The table below is generated from the `SkillFrontmatter` Zod schema in `src/core/types.ts`. This is the authoritative field list — the loader rejects any skill with missing required fields.

| Field | Type | Req? | Default | Description |
|---|---|---|---|---|
| `name` | `string` | yes | — | Unique identifier, kebab-case. Filename must match. |
| `kind` | `atomic|composite|meta` | yes | — | Composition model: atomic = single step, composite = chains/sub_skills, meta = orchestrator. |
| `group` | `string` | yes | — | Logical group: planning, development, review, testing, debug, ops. |
| `description` | `string (≤512 chars)` | yes | — | Trigger-optimised summary shown in selector. Budget: 512 chars hard cap; doctor warns at 280+. |
| `trigger` | `string[]` | no | [] | Keywords/phrases for intent-router matching. |
| `expected_tokens` | — | — | — | — |
| `tools` | `string[]` | no | [] | Claude Code tools this skill may use (Read, Edit, Bash, Glob, Grep). |
| `chains` | `SkillChain[]` | no | [] | Peer-pipeline links: {before: slug} or {after: slug}. Mutually exclusive with sub_skills. |
| `sub_skills` | `string[]` | no | — | Tree composition: ordered child skills the parent orchestrates. Mutually exclusive with chains. |
| `workflow` | `SkillWorkflow` | no | — | Multi-phase workflow descriptor: {phases: string[], terminal: string}. |
| `language` | `string` | no | universal | Language overlay scope. Omit or set to "universal" for all projects. |
| `tags` | `string[]` | no | [] | Single-word tags (no whitespace). Used for filtering. |
| `aliases` | `string[]` | no | [] | Alternative trigger keywords. |
| `isHidden` | `boolean` | no | false | Legacy hidden flag; prefer user-invocable: false. |
| `tooltip` | `string` | no | — | Short tooltip shown in the UI. |
| `license` | `string` | no | — | SPDX license identifier for third-party skills. |
| `user-invocable` | `boolean` | no | true | Appears in the slash menu when true. New helpers MUST set false. Doctor warns when user-invocable count exceeds 15. |
| `disable-model-invocation` | `boolean` | no | false | Prevents auto-routing by the intent router. |
| `argument-hint` | `string` | no | — | Hint text shown when the user types /skill-name in the slash menu. |
| `arguments` | `string[]` | no | — | Declared argument names for argument-taking skills. |
| `allowed-tools` | `AgentTool[]` | no | — | Restrict tool access to Read|Edit|Bash|Glob|Grep subset. |
| `model` | `string` | no | — | CC-native model field (overrides preferred_model in CC context). |
| `effort` | `string` | no | — | CC-native effort field. |
| `eval_fixtures` | `EvalFixture[]` | no | — | Inline eval fixture suite. Each entry: {name, prompt, expected_skills[], expected_agent?}. |
| `version` | `string (semver)` | no | — | Semver x.y.z. doctor warns when below skill_versions pin. |
| `breaking_changes_in` | `string[]` | no | [] | Semver versions where this skill had breaking changes. |
| `replacement` | `string` | no | — | Slug of the skill that replaces this one (deprecation). |
| `disambiguator` | `string` | no | — | Prefix for description collision avoidance. Loader prepends "Anvil's <disambiguator>: <description>". |
| `notepads_section` | `enum` | no | — | Notepad section to append after a successful run: learnings|decisions|issues|verification|problems|large-outputs. |
| `output_schema` | `string|object` | no | — | Zod-shorthand name (e.g. "ReviewReport") or JSON-schema object. Validated at the runner boundary. |
| `input_schema` | `string|object` | no | — | Zod-shorthand name or JSON-schema object for input validation. |
| `source` | `authored|distilled|imported|unknown` | no | — | Provenance: authored=hand-written, distilled=generated, imported=third-party. |
| `confidence` | `number (0–1)` | no | — | Provenance confidence score. |
| `created_at` | `string (YYYY-MM-DD)` | no | — | First-authored date. |
| `provenance` | — | — | — | — |
| `paths` | `string[]` | no | — | Glob patterns for path-scoped injection. CC injects this skill body when an Edit/Write touches a matching file. |
| `strategy` | — | — | — | — |
| `extends_skill` | — | — | — | — |
| `context` | `inherit|fork` | no | — | CC context isolation: `inherit` shares the caller's context (default); `fork` spawns a fresh sub-context. Use `fork` for long-running or isolatable skills. |
| `agent` | `string` | no | — | CC agent delegation slug. When set, CC routes skill execution to the named agent instead of running the body inline. |
| `scripts` | `string[]` | no | — | Helper script paths the skill body references (e.g. `.mjs`, `.sh`). Doctor warns on missing paths. |
| `references` | `string[]` | no | — | Reference document or spec paths the skill cites. Doctor warns on missing paths. |
| `assets` | `string[]` | no | — | Any other supporting file paths (templates, fixtures, etc.). Doctor warns on missing paths. |
| `activation` | — | — | — | — |
| `templates` | — | — | — | — |
| `mcp_servers` | — | — | — | — |
| `context_providers` | — | — | — | — |
| `x-anvil` | — | — | — | — |

> **Note:** `SkillFrontmatter` does **not** use `.strict()`. Unknown CC-native fields (e.g. `color:`) are stripped at parse time so skills remain forward-compatible with new CC spec additions.

## Description budget (1 536-char per-entry / 8 K total)

Claude Code silently drops selector keywords that exceed the per-entry cap. Anvil enforces a **512-char hard cap** on `description` (Warp parity). The doctor `description-budget` lint warns when a description exceeds 280 chars to encourage tighter copy.

Guidelines:
- Lead with the trigger scenario: _"Use when …"_
- List 2–4 concrete action keywords separated by em-dashes
- Keep the total across all your installed skills under 8 K characters

## `${CLAUDE_SKILL_DIR}` path substitution

Inside a skill body, `${CLAUDE_SKILL_DIR}` is replaced at load time by the absolute path to the directory containing the skill file. Use it to reference sibling assets without hardcoding paths:

```markdown
See also: ${CLAUDE_SKILL_DIR}/examples/usage.md
```

## Description-as-trigger doctrine

The `description` field is the primary routing signal. The intent router scores it against the user's prompt. Rules:

1. **Lead with the scenario, not the feature.** Write "Use when reviewing code for quality issues" not "Code review skill".
2. **Use the words users actually type.** If users say "lint my PR", put "lint", "PR", "pull request" in the description.
3. **Avoid filler.** Words like "helps with", "provides", "enables" dilute the trigger score.
4. **One skill, one scenario.** If the description covers two different triggers, split into two skills.

## Voice-profile guidance

Skills should have a consistent authorial voice. Choose one of:
- **Directive** — imperative instructions ("Read the diff. List findings."). Use for review and analysis skills.
- **Collaborative** — first-person shared task ("We will: 1. explore… 2. propose…"). Use for planning and design skills.
- **Tutorial** — second-person instructional ("When you encounter X, do Y"). Use for rules and standards overlays.

Set the voice in the first non-frontmatter paragraph and maintain it throughout the body. Mixing voices in one skill body confuses the model about its role.

## `user-invocable` behaviour

| Value | Effect |
|---|---|
| `true` (default) | Skill appears in the `/` slash menu |
| `false` | Hidden from slash menu; still auto-routable and invocable via `Skill({skill: "anvil:<slug>"})` |

**New-skill rule:** every new skill that is a helper, sub-skill, or language overlay **must** explicitly set `user-invocable: false`. Leave it at `true` only for direct user entry points. `anvil doctor` warns when the user-invocable count exceeds 15.

## `chains` vs `sub_skills`

| Feature | `sub_skills` | `chains` |
|---|---|---|
| Composition model | Tree (skill-driven; parent owns children) | Peer pipeline (orchestrator-driven; linear) |
| Who orchestrates | The parent skill | The caller / orchestrator |
| Typical use | One skill contains sub-specialisms | Skills that run around another skill |
| Mutual exclusivity | Cannot be combined with `chains` | Cannot be combined with `sub_skills` |

Both fields default to `[]`. A skill with non-empty `sub_skills` AND non-empty `chains` is rejected at load time.

## Path-scoped injection (`paths:` field)

```yaml
paths:
  - "**/*.ts"
  - "**/*.tsx"
```

When `paths:` is set, CC injects this skill's body whenever an Edit/Write/MultiEdit touches a matching file. Used by `skills/languages/<lang>/rules/` overlays to deliver per-language guidance exactly when the user is editing a matching file. OpenCode ignores `paths:` (graceful fall-through to standing instructions).

## Model alias usage

Use provider-neutral aliases rather than hardcoded model IDs:

| Alias | Resolution |
|---|---|
| `cheap` | Fastest/cheapest model (e.g. Haiku) |
| `balanced` | Default balanced model (e.g. Sonnet) |
| `best` | Highest-capability model (e.g. Opus) |

Aliases are resolved by `src/core/models/aliases.ts` — update that file (not skill frontmatter) when the provider releases a new model.

<!-- gen:end -->

