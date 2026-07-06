# Output / Input Templates

Anvil separates **skill behaviour** (what a skill does) from **skill output shape** (the format the skill emits). Behaviour stays in the skill's `.md` body; output shape lives in `templates/<kind>/<variant>.md`.

This separation lets you:

- Override a template prose for your team without forking the skill.
- Render the same skill differently on Claude Code, OpenCode, and other surfaces.
- Edit a heading in one file instead of grepping every skill that emitted it.

## Anatomy

A template is a plain markdown (or JSON) file under one of the per-kind subdirectories at the repo root:

```
templates/
  decisions/
    default.md          # generic markdown
    claude-code.json    # AskUserQuestion payload variant
    opencode.md         # OpenCode-flavoured markdown
  plans/
    default.md
  specs/
    default.md
  code-review/
    default.md
  tickets/
    default.md
  releases/
    default.md
  changelogs/
    default.md
  prompts/
    default.md
```

Skills opt in by listing kinds in frontmatter and using `${TEMPLATE:<kind>}` in the body:

```yaml
---
name: brainstorm-spec
templates: [decisions, specs]
---

When deriving a decision, use this shape:

${TEMPLATE:decisions}

Write the spec to this layout:

${TEMPLATE:specs}
```

The renderer (`src/skills/body.ts` → `renderSkillBody`) substitutes `${TEMPLATE:<kind>}` at render time, after a single read-from-disk pass per (kind, variant) tuple.

## Resolution order

For each `${TEMPLATE:<kind>}` reference, the resolver tries (top wins):

1. **User override** — `~/.anvil/templates/<kind>/<variant>.md`
2. **Bundled** — `<anvilRoot>/templates/<kind>/<variant>.md`

Within each tier, variants are tried in this order:

1. `<surface>.md` — when the renderer knows the active surface (e.g. `claude-code.md`, `opencode.md`).
2. `<surface>.json` — same, for payload-shaped variants (e.g. Claude Code AskUserQuestion JSON).
3. `default.md` — fallback.

The lookup is **lenient**: a `${TEMPLATE:foo}` reference with no matching file anywhere stays in the body verbatim. The doctor `templates/embedded-prose-lint` row surfaces drift; the renderer never throws.

## Overriding a template

Drop a file under `~/.anvil/templates/<kind>/<variant>.md` and it wins automatically the next time a skill that references that kind renders.

```bash
mkdir -p ~/.anvil/templates/decisions
cat > ~/.anvil/templates/decisions/default.md <<'MD'
**Team-style decision shape:**

Question — Options — Choice — Reason — Owner — Review-date

(See team handbook ch. 4 for the full rationale.)
MD
```

After saving, `anvil skill run brainstorm-spec` (or any other skill that lists `templates: [decisions]`) splices your override in instead of the bundled prose.

The doctor reports active overrides via the `templates/user-overrides-loaded` row.

## Surface variants

When the renderer caller passes `surface: 'claude-code'` (or another value) on its context, the resolver tries `claude-code.md` and `claude-code.json` before falling back to `default.md`. This is how the same skill produces an AskUserQuestion payload on Claude Code and a plain markdown block on OpenCode.

Add a variant simply by dropping a file with the surface name in the same kind directory:

```
templates/decisions/claude-code.json  # used when surface == 'claude-code'
templates/decisions/opencode.md       # used when surface == 'opencode'
templates/decisions/default.md        # used for any other surface
```

The surface is supplied by the caller (currently the skill CLI; future adapter hooks will pin the surface for their channel).

## Authoring guidance

- **One kind per output shape.** If two skills emit the same shape, they share a kind.
- **Lead with `default.md`.** Add surface variants only when the surface materially changes the shape (JSON payload, XML envelope, terminal colours).
- **Never duplicate prose between a skill body and a template.** The skill body owns *when* and *why*; the template owns *what*.
- **Mark drift with `<!-- template-prose -->`.** When a skill still embeds a block that will move to a template, drop the marker comment immediately above it. The doctor lint will remind you to migrate.

## Doctor rows

| Row | Meaning |
|---|---|
| `templates/user-overrides-loaded` | Lists every kind/variant under `~/.anvil/templates/`. Pass + "none" when no overrides exist (suppressed in quiet mode). |
| `templates/embedded-prose-lint` | Warns when a skill body contains `<!-- template-prose -->` but no `templates:` frontmatter field — migrate the embedded block into `templates/<kind>/`. |

## Related contracts

- **** — `${ANVIL_*}` artefact-path tokens. Runs *after* the templates pass, so spliced-in template content can itself reference `${ANVIL_PLANS_DIR}`, etc.
- **** — decision template (consumed via `templates: [decisions]`).
- **** — skill/agent/command/rule audit (the migration backlog driver).

## Where to look in the code

- `src/core/templates/resolver.ts` — the resolver kernel.
- `src/core/templates/index.ts` — public barrel.
- `src/skills/body.ts → renderSkillBody` — the substitution pipeline (templates first, then `${ANVIL_*}` tokens).
- `src/commands/cli/doctor-checks/templates.ts` — doctor rows.
