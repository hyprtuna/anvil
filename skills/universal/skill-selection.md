---
name: skill-selection
user-invocable: false
description: 'Use when routing a user prompt to the right skill(s) based on intent, project context, and trigger keywords.'
tools: [Read]
x-anvil:
  kind: atomic
  group: planning
  trigger: [select, which skill, route]
  language: universal
  composition: {chains: []}
---

> **Invoke via `Skill({skill: "anvil:skill-selection"})`.** This is a skill, not an agent. If you reached for the Agent tool, you're using the wrong primitive.

# Skill Selector

You route a user prompt to the appropriate skill(s) by matching trigger keywords, tags, and aliases, then scoring by relevance with language overlay adjustments. Be fast -- this is routing, not reasoning.

## Scoring Algorithm

For each registered skill, compute a score against the user prompt:

1. **Trigger match** (+1 per trigger): case-insensitive substring match of each trigger keyword against the prompt. A skill with triggers `["pr", "pull request"]` scores +1 if the prompt contains "pr" and +1 if it contains "pull request".
2. **Tag exact match** (+2 per tag): exact case-insensitive match of skill tags against tokens in the prompt. Tags are taxonomic labels (e.g., `automation`, `testing`) so they get higher weight.
3. **Alias substring match** (+1 per alias): case-insensitive substring match. Aliases are multi-word phrases like "merge request" that serve as alternate names.
4. **Language overlay multiplier** (x2): if the project's detected language matches a language-specific skill, double its total score. This ensures `typescript/code-reviewer` outranks `universal/code-reviewer` in a TypeScript project.

## Tie-Breaking

When two skills have equal scores:

- Prefer the skill with **more specific triggers** (fewer, longer trigger phrases indicate higher specificity).
- If still tied, prefer the **language-specific** skill over the universal one.
- If still tied, preserve registry order (stable sort).

## Disambiguation

When multiple skills match with nonzero scores, return **all of them** sorted by descending score. The caller decides whether to invoke the top result or present options. Never silently discard lower-ranked matches -- the caller may need them for chaining.

## Edge Cases

- **Empty prompt**: return an empty array. Do not panic, do not return all skills.
- **No matches**: return an empty array. The caller handles the fallback.
- **Single match**: return a one-element array. No special casing.

## Performance

Scoring is O(skills x triggers) with substring checks. Fine for <100 skills. No caching needed at this scale.

## When to Use Triggers vs Tags vs Aliases

- **Triggers**: natural language fragments users actually type ("create pr", "fix bug", "write test"). Keep them short and specific.
- **Tags**: taxonomy labels for categorical grouping ("automation", "testing", "planning"). Used for broad classification.
- **Aliases**: multi-word alternate names for the skill ("merge request", "pull request"). Used when a concept has multiple common names.

## Output

Return a JSON array of skill names ordered by descending score. Example: `["github-workflow", "code-reviewer"]`.
