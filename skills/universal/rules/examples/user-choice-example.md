---
name: user-choice-example
user-invocable: false
description: Use when verifying the two-question user-choice pattern in E2E tests — demonstrates conformant Q1 (location) and Q2 (format) AskUserQuestion payload shapes. NOT a shipping skill.
tools: []
license: MIT
x-anvil:
  kind: meta
  group: rules
  tags: [pattern, example, user-choice, two-question]
---

# user-choice-example

**Announce:** I'm using the user-choice-example skill to demonstrate the two-question pattern (location + format) for storing a research note.

## Status

Starting the two-question user-choice prompt.

## Q1 — Location choice

Where should the research note be stored? Location and format are independent choices.

I will present the first `AskUserQuestion` payload to the user now:

```json
{
  "question": "Where should the research note be stored?",
  "intro": "Storing under .anvil/research/ integrates with Anvil tooling (search, cross-linking, structured frontmatter). Storing under docs/research/ keeps the artifact in your repo's public docs. Out-of-project storage keeps your repo clean. A custom path gives you full control.",
  "options": [
    {
      "label": ".anvil/research/ (Recommended)",
      "description": "In-project Anvil tree; created if missing. Integrates with Anvil tooling — search, cross-linking, structured frontmatter."
    },
    {
      "label": "docs/research/",
      "description": "In-project public-shaped docs. Use when you want the artifact in your repo's published docs."
    },
    {
      "label": "~/.anvil/projects/<auto-name>/research/",
      "description": "Out-of-project; keeps your project repo clean of generated artifacts. Only shown when ~/.anvil/ exists."
    },
    {
      "label": "Other (custom path)",
      "description": "Provide a relative path. Must not contain \"..\" or escape the project root."
    }
  ],
  "_rationale": "Picks up structured frontmatter and Anvil cross-linking; the directory is bootstrapped on first use."
}
```

## Q2 — Format choice

What format should the research note use? Format is independent of location.

I will present the second `AskUserQuestion` payload to the user now:

```json
{
  "question": "What format should the research note use?",
  "intro": "Choose based on who will read the artifact and which tools need to consume it. Format is independent of where the file is stored.",
  "options": [
    {
      "label": "Machine-readable (JSON) (Recommended)",
      "description": "Structured, schema-validated, consumable by tooling like `anvil agent lint`; best when other tools will read this."
    },
    {
      "label": "Markdown",
      "description": "Human-readable narrative; renders in PR diffs and on GitHub; best when humans will read this."
    },
    {
      "label": "Both",
      "description": "Write both files at the chosen location; use when both audiences matter."
    }
  ],
  "_rationale": "JSON enables tooling validation and cross-linking; markdown serves human readers in PRs and on GitHub."
}
```

After the user selects location and format:
- `${ANVIL_RESEARCH_DIR}` → `mkdir -p ${ANVIL_RESEARCH_DIR}`; load `anvil-addendum.md` for Anvil-flavored output.
- `docs/research/` or custom path → use generic skill body verbatim; validate path (relative, no `..`, no cwd escape).
- JSON → write `<name>.json`; Markdown → write `<name>.md`; Both → write both.

## Done — status: DONE
