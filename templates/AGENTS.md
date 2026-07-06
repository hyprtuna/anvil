# templates/ — AI Developer Notes

Two co-located template families live here:

1. **Project-init files** (top-level) used by `anvil init` and related commands
   to generate project-local files.
2. **Skill/agent output templates** (per-kind subdirectories) referenced by
   `${TEMPLATE:<kind>}` substitution at skill-load time (ANV-0137).

## Project-init files (top-level)

- `CLAUDE.md` — user-project CLAUDE.md starter (copied and customized by `anvil init`).
- `AGENTS.md` — same for AGENTS.md (this file is the source of truth; `CLAUDE.md` is a stub).
- `plan.md` — plan document template.
- `spec.md` — spec document template.
- `spec-template.md` — alternative spec template with extended frontmatter.
- `statusline.sh` — bash statusline reference implementation.
- `tasks.md` — tasks tracking template.

## Skill output templates (per-kind subdirectories) — ANV-0137

Each subdirectory is one *template kind*. Skills reference a kind by listing
it in their frontmatter `templates: [...]` array; the loader resolves
`${TEMPLATE:<kind>}` references in the skill body at render time, splicing in
the surface-appropriate variant.

<!-- doc-drift: skip -->
The per-kind subdirectories and their bundled variants are:

- decisions/ — `<decisions>` block four-part structure + decision template — variants: default, claude-code (json), opencode <!-- doc-drift: skip -->
- plans/ — plan markdown frontmatter + task shape — variants: default <!-- doc-drift: skip -->
- specs/ — spec markdown frontmatter + section shape — variants: default <!-- doc-drift: skip -->
- code-review/ — severity taxonomy + findings structure — variants: default <!-- doc-drift: skip -->
- tickets/ — ADR / ticket markdown shape — variants: default <!-- doc-drift: skip -->
- releases/ — release record shape — variants: default <!-- doc-drift: skip -->
- changelogs/ — Conventional-Commits → changelog section map — variants: default <!-- doc-drift: skip -->
- prompts/ — generic research prompt scaffold — variants: default <!-- doc-drift: skip -->

**Resolution order at render time:**
1. User-override (`~/.anvil/templates/<kind>/<variant>.md`) — wins if present.
2. Bundled `templates/<kind>/<variant>.md` from this repo.

**Surface variants:** the renderer prefers `<surface>.md`/`<surface>.json` when
the active surface is known (e.g. `claude-code`, `opencode`); falls back to
`default.md` otherwise. Unknown variant references in skill bodies are
**lenient** — they pass through verbatim so authors can stage migrations.

## Rules

- Placeholders use Mustache-style `{{variable}}` syntax in project-init files.
- Skill output templates use `${TEMPLATE:<kind>}` substitution syntax in the
  *skill body*. The body of the template file is itself plain markdown.
- Never hardcode file paths — always reference via template variables.
- When a template changes, regenerate `tests/fixtures/` expected outputs and commit.
