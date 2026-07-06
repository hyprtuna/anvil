# Adapter Acceptance-Transcript Policy

> **Status:** Active — v0.12.2+
> **Ticket:**
> **Applies to:** `src/adapters/`, `src/opencode-plugin/`

## Motivation

Anvil shipped two P0 defects in the OpenCode plugin without any behavioural acceptance gate:

- **W-001** — `using-anvil/SKILL.md` is referenced three times in
  `src/opencode-plugin/index.ts:151–193` but the file did not exist on disk.
  Every OC session silently bootstrapped nothing.
- **W-002** — `OC_HOOK_MAP` (runtime, `src/opencode-plugin/hooks/map.ts:42–54`) and
  `HOOK_KIND_TO_OC_EVENT` / `UNMAPPED_OC_HOOKS` (manifest schema,
  `src/core/manifest-schema/opencode.ts:35–70`) actively contradicted each other on
  11 HookKinds.

Both bugs were invisible to unit tests and integration tests because those tests patched
around the very paths that were broken. A live session transcript would have caught
either defect in under a minute.

## Policy

**Any pull request that modifies files under `src/adapters/` or `src/opencode-plugin/`
MUST include at least one acceptance transcript.**

### Transcript location

```
transcripts/<ISO-date>-<adapter-slug>[.<label>].json
```

Examples:
- `transcripts/2026-05-08-claude-code.json`
- `transcripts/2026-05-08-opencode.example.json`

### Minimum transcript content

A valid transcript MUST contain evidence of both:

1. **Bootstrap injection** — the Anvil `using-anvil` skill (or its platform equivalent)
   was delivered to the model at session start. Look for a `system` or `tool_result`
   message whose content mentions `anvil` or lists registered skills.

2. **Skill auto-trigger** — in response to the canonical Anvil prompt
   (`"What skills does this project have?"` or equivalent), the model invoked
   `Skill({skill: "anvil:<slug>"})` or the platform equivalent before generating prose.

### Transcript format (minimal valid shape)

```json
{
  "schema": "anvil-transcript/1",
  "date": "<ISO-8601>",
  "adapter": "<claude-code|opencode>",
  "anvil_version": "<semver>",
  "bootstrap_injected": true,
  "skill_triggered": true,
  "canonical_prompt": "<verbatim prompt text>",
  "messages": [
    { "role": "system",  "content": "<bootstrap snippet — first 200 chars minimum>" },
    { "role": "user",    "content": "<canonical prompt>" },
    { "role": "assistant","content": "<response that includes Skill invocation>" }
  ]
}
```

`bootstrap_injected` and `skill_triggered` are self-certified boolean flags. Reviewers
MUST verify at least one message in the `messages` array supports each flag.

### Reviewer checklist

- [ ] `transcripts/<date>-<adapter>.json` file is present in the PR diff.
- [ ] `bootstrap_injected: true` and at least one `system` message contains Anvil skill
      registration evidence.
- [ ] `skill_triggered: true` and at least one `assistant` message shows a Skill
      invocation before prose.
- [ ] Adapter slug in the filename matches the adapter modified (`claude-code` or
      `opencode`).

## CI enforcement

A lint test at `tests/unit/policy/adapter-transcript-required.test.ts` simulates a
PR diff and asserts that any change to `src/adapters/` or `src/opencode-plugin/` without
a matching `transcripts/` artifact fails the check. This test runs as part of
`bun run test` in CI.

See `.github/workflows/ci.yml` for the full CI gate chain.

## Exemplar

`transcripts/2026-05-08-claude-code.example.json` — minimal valid transcript showing
bootstrap injection and Skill auto-trigger. Use as a template when capturing real
session data.

## Out of scope

Fully automated transcript replay (covered by

## See also

- `src/adapters/CLAUDE.md` — adapter authoring conventions
- `src/opencode-plugin/CLAUDE.md` — OpenCode plugin conventions
- `.anvil/audits/_anvil-self-audit.md` §W-001, §W-002 — root-cause evidence
