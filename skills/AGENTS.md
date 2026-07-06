# skills/ — AI Developer Notes

> **Output conventions:** skills must open with `## Status` and close with `## Done — status: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED`. See [`.anvil/specs/output-conventions.md`](../.anvil/specs/output-conventions.md) for the full spec and four-state vocabulary.
>
> **New in v0.7.0:** `disambiguator` field, `notepads_section` field, HARD-GATE blocks, four-state vocabulary, output-conventions cross-link. See sections below.

Skill content. Each skill is a `.md` file with YAML frontmatter, validated against `SkillSchema` in `src/core/types.ts`.

## Location-driven user-choice pattern

When a skill generates an artifact (plan, spec, research note, decision record, audit, review,
ADR), it must ask **where** to store the artifact rather than detecting project structure and
assuming a format silently. Location drives format: `.anvil/<kind>/` yields Anvil-flavored output
with structured frontmatter; `docs/<kind>/` or a custom path yields generic output.

Use the `DecisionPrompt` primitive from `src/core/templates/decision.ts` and render it with
`renderDecisionClaudeCode` to produce an `AskUserQuestion` payload:

```yaml
question: "Where should the research note be stored? Location determines format."
options:
  - label: ".anvil/research/ (Recommended)"  # Integrates with Anvil tooling; bootstrapped if missing
  - label: "docs/research/"                  # Generic format
  - label: "Other (custom path)"             # Generic format; user provides path
```

Full reference: `docs/skills/user-choice-pattern.md`.
Rule skill: `skills/universal/rules/user-choice-discipline.md`.
Example: `skills/universal/rules/examples/user-choice-example.md`.

---

## Primary Surface Philosophy

**Agents are the user-facing primary surface. Skills are utilities agents consume.**

Skills default to `user-invocable: false` (hidden from the slash menu) unless the skill is a direct user entry point. A skill is user-invocable only when a user would naturally type `/skill-name` themselves to start a top-level workflow.

The current user-invocable skills (≤ 15 enforced by `anvil doctor`) are:

Derived from frontmatter; doctor enforces parity (see `anvil doctor`).

```
architecture-decision-record  autonomous-execution  brainstorm-spec
changelog-generation          code-review           debugging
development                   feature-development   git-workflow
learning                      mcp-construction      orchestration
planning                      test-driven-development  ui-design
```

All other skills — language overlays, ui/ sub-skills, rules/, workflows/, and utility helpers — carry `user-invocable: false` in their frontmatter. They remain fully loadable by agents and auto-routable by the intent router.

## Layout

- `universal/` — language-agnostic skills. Shipped with Anvil.
  - `universal/ui/` — UI sub-skills consumed by `ui-design` and `design-system-generation`.
  - `universal/rules/` — Behavioural rule overlays injected by hooks or agents.
  - `universal/workflows/` — Workflow templates consumed by agents.
- `languages/<lang>/` — language-specific overlays (`javascript/`, `typescript/`, `php/`, `python/`, `go/`, `rust/`, `java/`, `kotlin/`, `ruby/`).
- Top-level subdir skills (e.g. `using-anvil/SKILL.md`) for skills that need sibling directories.

## Subdirectory form — progressive disclosure (ANV-0061)

A skill may live in either flat form or subdirectory form:

| Form | Path | When to use |
|---|---|---|
| Flat | `skills/<tier>/<slug>.md` | Self-contained skills ≤200 lines |
| Subdirectory | `skills/<tier>/<slug>/SKILL.md` | Skills with sibling `references/` or `scripts/` |

In the subdirectory form, the skill's main body lives in `SKILL.md`. Sibling directories serve as progressive disclosure:

- `references/` — supplementary reference documents (best practices, examples, API summaries). Not loaded as skills — they exist to inform complex reasoning without bloating the main skill body.
- `scripts/` — helper scripts that the skill may invoke via tool calls.

**When to adopt subdirectory form:**
- The skill body exceeds ~200 lines.
- You want to link detailed reference material the agent can read on demand.
- The skill needs sibling executables or templates.

**Doctor lint (ANV-0061):** `anvil doctor` warns when a `SKILL.md` exceeds 200 lines and has no sibling `references/` directory — a signal to extract detailed content into progressive-disclosure files.

**Rule:** Only `SKILL.md` is loaded by the skill loader. Files in `references/` or `scripts/` are loaded by the agent at runtime via tool calls. Do not give reference files valid skill frontmatter — they will be ignored by the loader and only confuse the agent.

## Rules

- Filename = `<skill-name>.md` (flat form) or `<slug>/SKILL.md` (subdir form), matches the `name` field in frontmatter.
- Frontmatter required fields: `name`, `description`. The `group` field is recommended but not enforced; it controls which resolver group the skill falls into.
- Do NOT use `preferred_model`, `preferred_effort`, `max_tokens`, or `fallback_model` — these were removed from `SkillFrontmatter` in v0.17 (ANV-0214). Use `anvil.toml` `[assignments]` or `models.json` groups to override resolver behavior per skill instead.
- New utility/helper skills **must** include `user-invocable: false`.
- Body contains the skill prompt content; no executable code inline.
- Before committing a new or modified skill: `anvil skill validate <name>` must pass.
- Language-specific skills override universal skills with the same name (user skills override both).

## Output discipline

> Cross-link: see [`.anvil/specs/output-conventions.md`](../.anvil/specs/output-conventions.md) for the full four-state vocabulary and section templates.

**Mandatory announce line:** before any non-trivial work, the skill body MUST emit a one-line
announcement of intent as its first non-frontmatter, non-heading content. This is the user's only
signal that delegation is happening when output is otherwise silent.

Format: `**Announce:** I'm using the [skill-name] skill to [one-line purpose].`

Example:
```markdown
**Announce:** I'm using the code-review skill to identify severity-graded findings in the diff.
```

If a skill body already has an announce-style line at the top, leave it. Add one only if absent.

## v0.9.0 frontmatter additions

### `sub_skills` field (Plan 33 A1) — tree composition

```yaml
sub_skills:
  - color-palette-design
  - typography-pairings
  - style-selection
```

When a skill declares `sub_skills`, the runtime schedules each child in declared order before the parent body runs. The parent body receives a `<sub-skill-outputs>` block in its conversation context containing the children's outputs, and acts as a coordinator that synthesises them into a unified result.

**`sub_skills` vs `chains` — which to use:**

| Feature | `sub_skills` | `chains.before` / `chains.after` |
|---|---|---|
| Composition model | Tree (skill-driven; parent owns children) | Peer pipeline (orchestrator-driven; linear) |
| Who orchestrates | The parent skill itself | The orchestrator / caller |
| Typical use | One skill *contains* sub-specialisms | Skills that run *around* another skill |
| Nesting | Single level in v0.9.0 | Unlimited (chain-of-chains) |
| Mutual exclusivity | **Cannot be combined with `chains` on the same skill** | Cannot be combined with `sub_skills` |

**Rules:**
- `sub_skills` and `chains` are **mutually exclusive on the same skill**. The loader rejects skills that declare both. This prevents ambiguity about which composition model applies at runtime.
- Children listed in `sub_skills` remain independently invocable — being a child is additive. A child can still be invoked directly by another skill, an agent, or the intent router.
- Missing child names append a `defects[]` entry on the parent and log a warning. The parent loads and runs in degraded mode without the missing child.
- Cycles (`a → b → a`, `a → b → c → a`) throw `SkillCycleError` at startup and must be fixed before the skill tree loads.
- The canonical proof-of-concept is `ui-design`, which coordinates `[color-palette-design, typography-pairings, style-selection]`.

**When to choose `sub_skills`:**
- The parent skill *contains* and *owns* child specialisms (e.g. a design skill owns its palette, typography, and style sub-specialisms).
- The children's outputs must be merged/synthesised before the final result.
- The parent is the user-facing entry point; children are implementation details.

**When to choose `chains`:**
- Peer-to-peer pipeline (e.g. a linter runs before a formatter runs before a committer).
- The orchestrator decides which skills run, not any individual skill.
- The ordering is the orchestrator's concern, not the skill's.

---

## v0.15.5 frontmatter additions

### Content-overlay composition (ANV-0092)

```yaml
strategy: replace   # replace | prepend | append | wrap
extends_skill: code-review
```

When a skill declares `strategy` + `extends_skill`, the loader runs a
composition pass after all skills have been loaded (and provider deduplication
has settled).  Both fields must be present or absent together.  Composition
overlays are mutually exclusive with `sub_skills` and `chains`.

| Strategy | Result |
|---|---|
| `replace` | Override body replaces the core body entirely — core is ignored. |
| `prepend` | `override_body + "\n\n" + core_body` |
| `append`  | `core_body + "\n\n" + override_body` |
| `wrap`    | Override body with `{CORE_TEMPLATE}` replaced by the core body. When the placeholder is absent, falls back to `append` with a console warning. |

**When to use each strategy:**

- **replace** — when your overlay is a complete rewrite that should not inherit any of the core's prose.
- **prepend** — when your overlay adds a preamble (project-specific context, team conventions) before the core instructions.
- **append** — when your overlay extends the core with addenda (extra rules, project epilogue, checklist).
- **wrap** — when you want structural control (e.g. add a "Context" header before the core and an "Output format" section after it) while keeping the core body in the middle.

**Provider precedence:**  `extends_skill` names the core skill by slug after
provider deduplication (ANV-0050) has already resolved the winner.  A project-
or user-level overlay can safely extend a bundled core — the composition pass
sees the authoritative, already-won set.

**Doctor:**  `anvil doctor` includes a "Composition overlays (ANV-0092)" row
listing all active overlays (slug, strategy, core).

---

## v0.7.0 frontmatter additions

### `disambiguator` field (Plan 31 C1)

```yaml
disambiguator: "graded reviewer — severity-tagged findings with file:line"
```

When set, the skill loader prefixes the `description` field at load time:
`Anvil's <disambiguator>: <original description>`

Use this when the skill name collides with built-in agents on the host platform or with a
native surface name (e.g. `code-reviewer`, `planning`, `researcher`). Caps: the combined
string must stay under 200 chars; if `Anvil's <disambiguator>: ` alone is ≥200 chars, load
fails with an error.

### `notepads_section` field (Plan 31 F2)

```yaml
notepads_section: learnings   # one of: learnings | decisions | issues | verification | problems
```

When set, the skill runtime appends an entry to the named notepad section after a successful run.
The headline is extracted from the first `## …` or `### …` heading in the output, or the first
non-empty line ≤80 chars. If neither yields content, the write is silently skipped.

### HARD-GATE blocks (Plan 31 E6)

Some skills use `<HARD-GATE>` blocks that block forward progress until a condition is met.
These are deliberately unbypassable. Current hard-gated skills:
- `brainstorming` — blocks implementation before design approval
- `test-driven-development` — blocks production code without a failing test
- `debugging` — blocks fix without root-cause investigation

If you add a new hard-gated skill, document the condition clearly in the block.

## Adding a skill

1. Copy the closest existing skill as a starting template.
2. Update `name`, `description`, `trigger`, `chains`, `language`.
3. If the skill is a helper/sub-task (not a direct user entry point), add `user-invocable: false` after the `name:` line.
4. If the skill name collides with a built-in surface on the host platform, add `disambiguator:` (see above).
5. If the skill should write to notepads after completion, add `notepads_section:` (see above).
6. Add the mandatory announce line as the first non-heading line after frontmatter.
7. Add `## Status` opener and `## Done — status: <vocab>` closer (see `.anvil/specs/output-conventions.md`).
8. If appropriate, add a `<HARD-GATE>` block for mandatory pre-conditions.
9. Rewrite the body for the new purpose.
10. Run `anvil skill validate <name>`.
11. Run `anvil doctor` and confirm the user-invocable count stays ≤ 15.
12. Commit.
