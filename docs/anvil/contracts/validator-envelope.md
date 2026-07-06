---
version: 1
applies-to: skill validators
status: stable
schema-id: anvil.validator-envelope.v1
---

# Stdin validator envelope contract (v1)

## Overview

Skill validators are short-lived executables declared on a skill's `validators:`
frontmatter array (see When Anvil's hook runtime fires the
PreToolUse, PostToolUse, or other lifecycle hooks for which a skill has
declared validators, the runtime spawns each validator and writes a single
JSON document to its **stdin**. The validator emits severity-graded findings
on stdout and exits.

This document specifies the **v1** stdin envelope. The contract is intended to
be implementation-agnostic: any third-party validator that reads `{tool_input,
hook_event, …}` from stdin, regardless of language or runtime, will work with
Anvil's validator dispatcher.

The `version` is reflected in the envelope's `schema` field
(`anvil.validator-envelope.v1`). Validators should refuse to run when the
schema string does not match a version they understand (see *Versioning
policy* below).

## Envelope schema (v1)

The complete v1 stdin payload is a single JSON object with the following shape.
Unknown fields MUST be ignored by validators (forward-compat). Fields marked
**required** are guaranteed to be present.

```ts
// Zod-style schema (illustrative — the canonical Zod definition lives in
// src/core/types.ts once lands).

const ValidatorEnvelopeV1 = z.object({
  // Always present. Identifies the envelope dialect + version.
  schema: z.literal('anvil.validator-envelope.v1'),

  // The lifecycle event that triggered the validator. Enumerated; see below.
  hook_event: z.enum([
    'PreToolUse',
    'PostToolUse',
    'UserPromptSubmit',
    'SessionStart',
    'Stop',
    'SubagentStop',
    'Notification',
    'PreCompact',
  ]),

  // The verbatim tool-call payload from Claude Code's hook input. Shape varies
  // by tool; Anvil does NOT normalise it. Common keys for file-touching tools
  // include `file_path`, `content`, `old_string`, `new_string`, `command`,
  // `pattern`, `path`. For Task launches: `description`, `subagent_type`.
  // See Claude Code's PreToolUse/PostToolUse hook schema for the authoritative
  // per-tool field list.
  tool_input: z.record(z.string(), z.unknown()),

  // The skill declaring this validator (kebab-case slug as registered in
  // ~/.anvil/registry.json).
  skill_id: z.string(),

  // The skill version at dispatch time (semver). Useful for validators that
  // gate on skill-pack revisions.
  skill_version: z.string(),

  // The Claude Code / OpenCode session transcript path. Absolute. Optional —
  // OpenCode does not always populate it.
  transcript_path: z.string().optional(),

  // The tool name being invoked (e.g. 'Edit', 'Write', 'Bash', 'Task'). Mirrors
  // the CC hook input's `tool_name`.
  tool_name: z.string(),

  // PostToolUse / Stop only: the response payload from the tool call. Absent
  // for PreToolUse and prompt-shaped events.
  tool_response: z.record(z.string(), z.unknown()).optional(),

  // The session ID. Stable per Claude Code / OpenCode session.
  session_id: z.string(),

  // The working directory CC/OC was launched in. Absolute path.
  cwd: z.string(),
})
```

### Field summary

| Field | Required | Notes |
|---|---|---|
| `schema` | yes | Always `"anvil.validator-envelope.v1"` in v1. |
| `hook_event` | yes | One of the eight enumerated lifecycle events. |
| `tool_input` | yes | Verbatim from CC; shape varies per tool. |
| `tool_name` | yes | Tool being invoked. |
| `skill_id` | yes | Skill that owns this validator. |
| `skill_version` | yes | Semver of the skill at dispatch. |
| `session_id` | yes | Stable per session. |
| `cwd` | yes | Absolute path. |
| `transcript_path` | no | Absent on OpenCode if not provided. |
| `tool_response` | no | Present on PostToolUse and Stop only. |

### Why the envelope is a superset of `{tool_input, hook_event}`

The minimal contract is **`tool_input` + `hook_event`** — that pair is enough
for a stateless syntactic check. The extra fields (`skill_id`, `skill_version`,
`session_id`, `cwd`, `transcript_path`, `tool_response`) carry the *context*
that lets a validator make decisions stateful checks need (read the transcript,
look up the skill body, key cache by session). A validator that only needs
`tool_input` and `hook_event` MUST still tolerate the additional keys
(forward-compat rule above).

## Examples

### Example 1 — PreToolUse on an Edit call

A validator declared by the `code-review` skill, checking a file edit before it
lands.

```json
{
  "schema": "anvil.validator-envelope.v1",
  "hook_event": "PreToolUse",
  "tool_name": "Edit",
  "tool_input": {
    "file_path": "/abs/path/to/src/auth.ts",
    "old_string": "export function authenticate(user)",
    "new_string": "export async function authenticate(user, opts)"
  },
  "skill_id": "code-review",
  "skill_version": "1.2.0",
  "session_id": "sess_01HXYZ…",
  "cwd": "/home/user/project",
  "transcript_path": "/home/user/.claude/sessions/sess_01HXYZ/transcript.jsonl"
}
```

### Example 2 — PostToolUse on a Write call

A validator declared by the `tdd-iron-law` skill, checking that a newly written
implementation file has a corresponding test file.

```json
{
  "schema": "anvil.validator-envelope.v1",
  "hook_event": "PostToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/home/user/project/src/parser.ts",
    "content": "export function parse(input: string) { /* ... */ }"
  },
  "tool_response": {
    "success": true,
    "filePath": "/home/user/project/src/parser.ts"
  },
  "skill_id": "tdd-iron-law",
  "skill_version": "0.3.1",
  "session_id": "sess_01HXYZ…",
  "cwd": "/home/user/project",
  "transcript_path": "/home/user/.claude/sessions/sess_01HXYZ/transcript.jsonl"
}
```

## Response shape (out of scope for this doc)

The validator's **stdout** response (severity-graded findings) is specified by
 This contract covers only the **input** envelope. When ships
its response specification, it will live next to this file (e.g.
`docs/anvil/contracts/validator-response.md`).

## Versioning policy

The envelope is versioned via the `schema` field. The dispatcher and validators
negotiate compatibility as follows.

### Additive changes (no version bump)

Adding new top-level fields is **non-breaking** and does NOT bump the version.
Validators MUST ignore unknown fields. The dispatcher MAY add fields in any
v1.x release of Anvil; the `schema` string remains
`"anvil.validator-envelope.v1"`.

### Breaking changes (version bump to v2)

Any of the following is a **breaking change** and forces a new schema string
(`anvil.validator-envelope.v2`):

- Removing or renaming a field.
- Narrowing a type (e.g. making `tool_input` more restrictive than
  `Record<string, unknown>`).
- Changing the meaning of an existing field.
- Removing a `hook_event` value (adding one is additive).

When v2 ships:

1. The dispatcher emits **both** v1 and v2 envelopes on stdin (concatenated as
   two newline-delimited JSON documents) for one minor-release deprecation
   window. Validators MAY pick whichever schema they understand and ignore the
   other.
2. After the deprecation window (one Anvil minor release), the dispatcher drops
   v1. Validators that have not migrated will see only v2 and SHOULD return a
   single `error`-severity finding instructing the user to upgrade.

### How a validator declares supported versions

Validators advertise the schemas they handle in their `validators:` frontmatter
entry ( schema). When unset, the dispatcher assumes v1 only.

```yaml
validators:
  - id: no-todo-comments
    command: ./scripts/no-todo.mjs
    severity: warn
    skillSection: 'Code Review Discipline'
    envelope_versions: ['anvil.validator-envelope.v1']
```

If a validator declares a version the dispatcher cannot satisfy, the dispatcher
SHALL skip the validator and surface a `warn`-severity finding to the user
(rather than silently no-op).

### Deprecation window summary

| Stage | Dispatcher behaviour | Validator action |
|---|---|---|
| v1 only (today) | Emits v1 only | Read v1 |
| v2 introduced | Emits v1 **and** v2 (concatenated) | Read either; prefer v2 |
| One minor release later | Emits v2 only | Read v2; emit migration error if still on v1 |

## Reference implementation pointer

Once lands, the canonical implementation will live at:

- **Zod schema:** `src/core/types.ts` — the `ValidatorEnvelopeV1` Zod object.
- **Dispatcher:** `src/hooks/handlers/post-tool-use.ts` (and sibling
  `pre-tool-use.ts`) — reads the active skill's `validators:` array, spawns
  each command, and writes the envelope to stdin.
- **Frontmatter schema:** `src/core/types.ts` — `SkillFrontmatter.validators`
  field.

Prior art studied during design lives in `references/impeccable/` (research-only,
gitignored — do not copy code). The relevant impeccable surfaces are documented
in `.anvil/research/impeccable.research.md§1.3` and
`.anvil/audits/impeccable.audit.md`. The pattern Anvil adopts is the
`{tool_input, hook_event}` stdin contract; the schema name, version field, and
versioning policy are Anvil-specific.
