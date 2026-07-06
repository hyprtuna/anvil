---
name: skill-creation
user-invocable: false
description: Use when scaffolding a new skill — emits valid frontmatter and a body that follows Anvil conventions.
tools: [Read, Write, Grep]
x-anvil:
  kind: atomic
  group: meta
  trigger: [new skill, create skill, scaffold skill]
  language: universal
---

> **Invoke via `Skill({skill: "anvil:skill-creation"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Skill Creator

You create a new skill file following Anvil conventions. Read existing skills for reference. Validate frontmatter before writing.

## Process

1. Gather name, group, description, and triggers from the user.
2. Select the best template skill based on the target group (see Template Selection below).
3. Read the template skill to understand the expected structure.
4. Substitute placeholders for the new skill's name, group, description, and triggers.
5. Write to `skills/universal/<name>.md` or `skills/languages/<lang>/<name>.md` as appropriate.
6. Validate the frontmatter against the Zod schema in `src/core/types.ts`.
7. Run post-creation verification (see below).
8. Report success with the file path.

## Template Selection

Choose the closest existing skill as a starting point based on the target group:

| Group | Template | Why |
|---|---|---|
| planning | `planning.md` | Full-featured: inputs, outputs, chains, detailed body |
| development | `development.md` | Shows tool usage patterns for code generation |
| review | `code-reviewer.md` | Demonstrates structured feedback output |
| testing | `test-driven-development.md` | Shows test-first workflow patterns |
| debug | `debugging.md` | Shows diagnostic process structure |
| automation | `ultra-worker.md` | Shows subagent dispatch patterns |
| meta | `skill-creation.md` | Self-referential; shows meta-skill conventions |
| ops | `verification.md` | Shows command execution and result checking |

If no group matches well, default to `planning.md` as the most complete example.

## Frontmatter Field Guidance

**name**: kebab-case, unique across all skills. Match the filename exactly (e.g., `my-skill` lives in `my-skill.md`).

**group**: One of: `planning`, `development`, `review`, `testing`, `debug`, `automation`, `meta`, `ops`. Pick the group that best describes the skill's primary purpose.

**description**: One sentence, present tense, no period. Shown in `anvil skill list` output. Be specific: "Generates migration files for database schema changes" not "Helps with databases."

**trigger**: Array of 2-5 short phrases that activate the skill via intent matching. Include the most natural ways a user would ask for this. Avoid overlapping with triggers from other skills in the same group.

**preferred_model**: Set to `opus` for skills that require deep reasoning (planning, architecture, debugging). Set to `sonnet` for skills that need speed or handle routine tasks. Set to `haiku` for lightweight tasks. Omit (or set to `inherit`) to inherit the group default.

**preferred_effort**: `low` for quick lookups, `normal` for standard tasks, `high` for deep analysis. Omit to use `normal`.

**tools**: List only the tools the skill actually needs. Common sets: `[Read, Grep, Glob]` for read-only skills, `[Read, Write, Grep, Glob, Bash]` for skills that modify files or run commands.

**chains**: Use sparingly. Only chain to a skill that should always run after this one (e.g., `reviewer` after `development`). Most skills do not need chains.

**isHidden**: Set to `true` for internal skills that should not appear in `anvil skill list` (e.g., helper skills invoked only via chains).

**language**: Set only for language-specific skills (e.g., `typescript`, `python`). Omit for universal skills.

**inputs/outputs**: Declare structured inputs when the skill requires specific parameters. Declare outputs when downstream skills or chains depend on structured data.

## Body Structure

Organize the skill body with these sections:

1. **Opening line** -- one sentence stating what the skill does and its approach.
2. **Process** -- numbered steps the agent follows. Keep to 4-8 steps.
3. **Output** -- what the skill produces (format, structure, deliverables).
4. **Anti-patterns** -- what not to do. 2-4 bullets covering common mistakes.

Not every skill needs all sections. Short utility skills can use just an opening line and a process list.

## Validation Checklist

Before writing the file, verify:

- [ ] `name` is kebab-case and unique (Grep for it across `skills/`)
- [ ] `group` is one of the valid group names
- [ ] `description` is a single sentence, present tense
- [ ] `trigger` array has 2-5 entries with no duplicates
- [ ] `tools` list contains only valid tool names
- [ ] `preferred_model` is a recognized model identifier
- [ ] Filename matches the `name` field exactly
- [ ] File is in the correct directory (`universal/` or `languages/<lang>/`)

## Post-Creation Verification

After writing the skill file:

1. Read the file back and confirm the YAML frontmatter parses without errors.
2. Check that `name` in frontmatter matches the filename.
3. Grep `skills/` for duplicate `name` values to confirm uniqueness.
4. Verify the body contains at least a Process section with numbered steps.
5. Report the file path and a summary of the skill to the user.
