#!/usr/bin/env bun
/**
 * ANV-0010 + ANV-0018 — Schema-led authoring doc generator.
 *
 * Reads HookKind / HookContext / HookResult / SkillFrontmatter Zod schemas
 * from src/core/types.ts and emits two files:
 *   docs/hook-authoring.md
 *   docs/skill-authoring.md
 *
 * Each file has a generator-managed body section between markers:
 *   <!-- gen:start -->
 *   <!-- gen:end -->
 *
 * Hand-edited prose outside the markers survives regeneration.
 * The generator REPLACES only the content between those markers.
 *
 * Usage:
 *   bun run scripts/generate-authoring-md.ts
 *   bun run scripts/generate-authoring-md.ts --check   # exit 1 if output differs from committed
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(here, '..')

const CHECK_MODE = process.argv.includes('--check')

// ---------------------------------------------------------------------------
// Schema introspection — pull values directly from the compiled types
// ---------------------------------------------------------------------------

// We import from source via bun (tsx-compatible) so the values are live.
const {
  HookKind,
  HookContext,
  HookResult,
  SkillFrontmatter,
  SkillKind,
  EffortLevel,
} = await import('../src/core/types.js')

/** Extract enum values from a z.enum() schema. */
function enumValues(
  schema: { options: string[] } | { _def: { values: string[] } },
): string[] {
  // z.enum stores values in _def.values or options depending on version
  if (
    'options' in schema &&
    Array.isArray((schema as { options: string[] }).options)
  ) {
    return (schema as { options: string[] }).options
  }
  const def = (schema as { _def: { values: string[] } })._def
  if (def?.values && Array.isArray(def.values)) return def.values
  return []
}

/** Extract shape keys from a z.object() schema. */
function objectKeys(schema: {
  shape?: Record<string, unknown>
  _def?: { shape?: () => Record<string, unknown> }
}): string[] {
  if (schema.shape && typeof schema.shape === 'object') {
    return Object.keys(schema.shape)
  }
  const shape = schema._def?.shape?.()
  if (shape) return Object.keys(shape)
  return []
}

// HookKind values (21)
const hookKindValues: string[] = enumValues(
  HookKind as Parameters<typeof enumValues>[0],
)

// HookContext fields
const hookContextFields: string[] = objectKeys(
  HookContext as Parameters<typeof objectKeys>[0],
)

// HookResult fields
const hookResultFields: string[] = objectKeys(
  HookResult as Parameters<typeof objectKeys>[0],
)

// SkillFrontmatter fields — from the inner .object() before .transform()/.refine()
function getSkillFrontmatterFields(): string[] {
  // SkillFrontmatter goes through .transform().refine() — we need the inner shape.
  // Walk _def chain to find the ZodObject.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let s: any = SkillFrontmatter
  const seen = new Set()
  while (s && !seen.has(s)) {
    seen.add(s)
    if (s._def?.typeName === 'ZodObject') {
      return Object.keys(s._def.shape())
    }
    // Traverse inner schemas
    if (s._def?.schema) {
      s = s._def.schema
      continue
    }
    if (s._def?.innerType) {
      s = s._def.innerType
      continue
    }
    if (s._def?.left) {
      s = s._def.left
      continue
    }
    break
  }
  // Fallback: enumerate from types.ts source text (never reached if Zod structure is stable)
  return []
}

const skillFrontmatterFields: string[] = getSkillFrontmatterFields()

// Anti-drift guards — fail loud if Zod internals change shape and the
// walkers above silently degrade. Numbers are tied to the schemas in
// src/core/types.ts at the time of writing; bump when schemas grow.
if (hookKindValues.length !== 21) {
  throw new Error(
    `[generate-authoring-md] HookKind walker returned ${hookKindValues.length} values, expected 21. Zod internals likely changed — fix enumValues() or update this guard.`,
  )
}
if (hookContextFields.length < 5) {
  throw new Error(
    `[generate-authoring-md] HookContext walker returned ${hookContextFields.length} fields, expected ≥5. Zod internals likely changed — fix objectKeys() or update this guard.`,
  )
}
if (hookResultFields.length < 4) {
  throw new Error(
    `[generate-authoring-md] HookResult walker returned ${hookResultFields.length} fields, expected ≥4. Zod internals likely changed — fix objectKeys() or update this guard.`,
  )
}
if (skillFrontmatterFields.length < 20) {
  throw new Error(
    `[generate-authoring-md] SkillFrontmatter walker returned ${skillFrontmatterFields.length} fields, expected ≥20. Zod internals likely changed — fix getSkillFrontmatterFields() or update this guard.`,
  )
}

// ---------------------------------------------------------------------------
// Hook kind metadata table
// ---------------------------------------------------------------------------

interface HookKindMeta {
  kind: string
  phase: string
  defaultEnabled: boolean
  description: string
}

const HOOK_KIND_META: Record<string, HookKindMeta> = {
  'session-start': {
    kind: 'session-start',
    phase: 'lifecycle',
    defaultEnabled: true,
    description: 'Claude Code session begins',
  },
  'session-end': {
    kind: 'session-end',
    phase: 'lifecycle',
    defaultEnabled: false,
    description: 'Session terminates normally',
  },
  'user-prompt-submit': {
    kind: 'user-prompt-submit',
    phase: 'lifecycle',
    defaultEnabled: true,
    description: 'User submits a prompt before model sees it',
  },
  'pre-tool-use': {
    kind: 'pre-tool-use',
    phase: 'lifecycle',
    defaultEnabled: true,
    description: 'Before any tool invocation (can block)',
  },
  'post-tool-use': {
    kind: 'post-tool-use',
    phase: 'advisory',
    defaultEnabled: false,
    description: 'After a tool returns its result',
  },
  'pre-compact': {
    kind: 'pre-compact',
    phase: 'compaction',
    defaultEnabled: false,
    description: 'Before context compaction fires',
  },
  notification: {
    kind: 'notification',
    phase: 'lifecycle',
    defaultEnabled: false,
    description: 'Claude emits a notification event',
  },
  stop: {
    kind: 'stop',
    phase: 'lifecycle',
    defaultEnabled: false,
    description: 'Top-level conversation stop',
  },
  'subagent-stop': {
    kind: 'subagent-stop',
    phase: 'lifecycle',
    defaultEnabled: false,
    description: 'A spawned subagent finishes',
  },
  'pre-commit': {
    kind: 'pre-commit',
    phase: 'git',
    defaultEnabled: true,
    description: 'Before git commit executes',
  },
  'post-edit': {
    kind: 'post-edit',
    phase: 'editor',
    defaultEnabled: true,
    description: 'After Edit/Write/MultiEdit completes',
  },
  'pre-push': {
    kind: 'pre-push',
    phase: 'git',
    defaultEnabled: true,
    description: 'Before git push executes',
  },
  'on-error': {
    kind: 'on-error',
    phase: 'lifecycle',
    defaultEnabled: true,
    description: 'A tool or handler returned an error',
  },
  'on-pr-open': {
    kind: 'on-pr-open',
    phase: 'git',
    defaultEnabled: true,
    description: 'A pull request is opened or updated',
  },
  'post-test-run': {
    kind: 'post-test-run',
    phase: 'advisory',
    defaultEnabled: false,
    description: 'After a test runner completes',
  },
  'context-monitor': {
    kind: 'context-monitor',
    phase: 'advisory',
    defaultEnabled: false,
    description: 'Monitors context token usage',
  },
  'prompt-guard': {
    kind: 'prompt-guard',
    phase: 'protective',
    defaultEnabled: false,
    description: 'Guards against harmful or off-policy prompts',
  },
  'phase-boundary': {
    kind: 'phase-boundary',
    phase: 'advisory',
    defaultEnabled: false,
    description: 'Workflow phase transition detected',
  },
  'read-guard': {
    kind: 'read-guard',
    phase: 'protective',
    defaultEnabled: false,
    description: 'Guards sensitive file reads',
  },
  'workflow-guard': {
    kind: 'workflow-guard',
    phase: 'protective',
    defaultEnabled: false,
    description: 'Enforces workflow step sequencing',
  },
  'on-large-output': {
    kind: 'on-large-output',
    phase: 'advisory',
    defaultEnabled: false,
    description: 'Tool result exceeds compression.threshold_words',
  },
}

// ---------------------------------------------------------------------------
// SkillFrontmatter field metadata table
// ---------------------------------------------------------------------------

interface FieldMeta {
  field: string
  type: string
  required: boolean
  default?: string
  description: string
}

const SKILL_FIELD_META: Record<string, FieldMeta> = {
  name: {
    field: 'name',
    type: 'string',
    required: true,
    description: 'Unique identifier, kebab-case. Filename must match.',
  },
  kind: {
    field: 'kind',
    type: 'atomic|composite|meta',
    required: true,
    description:
      'Composition model: atomic = single step, composite = chains/sub_skills, meta = orchestrator.',
  },
  group: {
    field: 'group',
    type: 'string',
    required: true,
    description:
      'Logical group: planning, development, review, testing, debug, ops.',
  },
  description: {
    field: 'description',
    type: 'string (≤512 chars)',
    required: true,
    description:
      'Trigger-optimised summary shown in selector. Budget: 512 chars hard cap; doctor warns at 280+.',
  },
  trigger: {
    field: 'trigger',
    type: 'string[]',
    required: false,
    default: '[]',
    description: 'Keywords/phrases for intent-router matching.',
  },
  preferred_model: {
    field: 'preferred_model',
    type: 'string',
    required: true,
    description: 'Model alias (cheap|balanced|best) or full claude-* id.',
  },
  preferred_effort: {
    field: 'preferred_effort',
    type: 'low|medium|high|xhigh|max',
    required: true,
    description: 'Effort level passed to the model.',
  },
  max_tokens: {
    field: 'max_tokens',
    type: 'integer',
    required: false,
    description: 'Upper bound on response tokens.',
  },
  fallback_model: {
    field: 'fallback_model',
    type: 'string',
    required: false,
    description: 'Fallback if preferred_model is unavailable.',
  },
  inputs: {
    field: 'inputs',
    type: 'SkillInput[]',
    required: false,
    default: '[]',
    description: 'Structured input declarations validated at invocation.',
  },
  outputs: {
    field: 'outputs',
    type: 'SkillOutput[]',
    required: false,
    default: '[]',
    description: 'Structured output declarations.',
  },
  tools: {
    field: 'tools',
    type: 'string[]',
    required: false,
    default: '[]',
    description:
      'Claude Code tools this skill may use (Read, Edit, Bash, Glob, Grep).',
  },
  chains: {
    field: 'chains',
    type: 'SkillChain[]',
    required: false,
    default: '[]',
    description:
      'Peer-pipeline links: {before: slug} or {after: slug}. Mutually exclusive with sub_skills.',
  },
  sub_skills: {
    field: 'sub_skills',
    type: 'string[]',
    required: false,
    description:
      'Tree composition: ordered child skills the parent orchestrates. Mutually exclusive with chains.',
  },
  workflow: {
    field: 'workflow',
    type: 'SkillWorkflow',
    required: false,
    description:
      'Multi-phase workflow descriptor: {phases: string[], terminal: string}.',
  },
  language: {
    field: 'language',
    type: 'string',
    required: false,
    default: 'universal',
    description:
      'Language overlay scope. Omit or set to "universal" for all projects.',
  },
  tags: {
    field: 'tags',
    type: 'string[]',
    required: false,
    default: '[]',
    description: 'Single-word tags (no whitespace). Used for filtering.',
  },
  aliases: {
    field: 'aliases',
    type: 'string[]',
    required: false,
    default: '[]',
    description: 'Alternative trigger keywords.',
  },
  isHidden: {
    field: 'isHidden',
    type: 'boolean',
    required: false,
    default: 'false',
    description: 'Legacy hidden flag; prefer user-invocable: false.',
  },
  tooltip: {
    field: 'tooltip',
    type: 'string',
    required: false,
    description: 'Short tooltip shown in the UI.',
  },
  license: {
    field: 'license',
    type: 'string',
    required: false,
    description: 'SPDX license identifier for third-party skills.',
  },
  'user-invocable': {
    field: 'user-invocable',
    type: 'boolean',
    required: false,
    default: 'true',
    description:
      'Appears in the slash menu when true. New helpers MUST set false. Doctor warns when user-invocable count exceeds 15.',
  },
  'disable-model-invocation': {
    field: 'disable-model-invocation',
    type: 'boolean',
    required: false,
    default: 'false',
    description: 'Prevents auto-routing by the intent router.',
  },
  'argument-hint': {
    field: 'argument-hint',
    type: 'string',
    required: false,
    description:
      'Hint text shown when the user types /skill-name in the slash menu.',
  },
  arguments: {
    field: 'arguments',
    type: 'string[]',
    required: false,
    description: 'Declared argument names for argument-taking skills.',
  },
  'allowed-tools': {
    field: 'allowed-tools',
    type: 'AgentTool[]',
    required: false,
    description: 'Restrict tool access to Read|Edit|Bash|Glob|Grep subset.',
  },
  model: {
    field: 'model',
    type: 'string',
    required: false,
    description:
      'CC-native model field (overrides preferred_model in CC context).',
  },
  effort: {
    field: 'effort',
    type: 'string',
    required: false,
    description: 'CC-native effort field.',
  },
  eval_fixtures: {
    field: 'eval_fixtures',
    type: 'EvalFixture[]',
    required: false,
    description:
      'Inline eval fixture suite. Each entry: {name, prompt, expected_skills[], expected_agent?}.',
  },
  version: {
    field: 'version',
    type: 'string (semver)',
    required: false,
    description: 'Semver x.y.z. doctor warns when below skill_versions pin.',
  },
  breaking_changes_in: {
    field: 'breaking_changes_in',
    type: 'string[]',
    required: false,
    default: '[]',
    description: 'Semver versions where this skill had breaking changes.',
  },
  replacement: {
    field: 'replacement',
    type: 'string',
    required: false,
    description: 'Slug of the skill that replaces this one (deprecation).',
  },
  disambiguator: {
    field: 'disambiguator',
    type: 'string',
    required: false,
    description:
      'Prefix for description collision avoidance. Loader prepends "Anvil\'s <disambiguator>: <description>".',
  },
  notepads_section: {
    field: 'notepads_section',
    type: 'enum',
    required: false,
    description:
      'Notepad section to append after a successful run: learnings|decisions|issues|verification|problems|large-outputs.',
  },
  output_schema: {
    field: 'output_schema',
    type: 'string|object',
    required: false,
    description:
      'Zod-shorthand name (e.g. "ReviewReport") or JSON-schema object. Validated at the runner boundary.',
  },
  input_schema: {
    field: 'input_schema',
    type: 'string|object',
    required: false,
    description:
      'Zod-shorthand name or JSON-schema object for input validation.',
  },
  source: {
    field: 'source',
    type: 'authored|distilled|imported|unknown',
    required: false,
    description:
      'Provenance: authored=hand-written, distilled=generated, imported=third-party.',
  },
  confidence: {
    field: 'confidence',
    type: 'number (0–1)',
    required: false,
    description: 'Provenance confidence score.',
  },
  created_at: {
    field: 'created_at',
    type: 'string (YYYY-MM-DD)',
    required: false,
    description: 'First-authored date.',
  },
  paths: {
    field: 'paths',
    type: 'string[]',
    required: false,
    description:
      'Glob patterns for path-scoped injection. CC injects this skill body when an Edit/Write touches a matching file.',
  },
  // ANV-0072 — CC-native context isolation and agent delegation fields.
  context: {
    field: 'context',
    type: 'inherit|fork',
    required: false,
    description:
      "CC context isolation: `inherit` shares the caller's context (default); `fork` spawns a fresh sub-context. Use `fork` for long-running or isolatable skills.",
  },
  agent: {
    field: 'agent',
    type: 'string',
    required: false,
    description:
      'CC agent delegation slug. When set, CC routes skill execution to the named agent instead of running the body inline.',
  },
  // ANV-0086 — Asset declarations for scripts, references, and assets.
  scripts: {
    field: 'scripts',
    type: 'string[]',
    required: false,
    description:
      'Helper script paths the skill body references (e.g. `.mjs`, `.sh`). Doctor warns on missing paths.',
  },
  references: {
    field: 'references',
    type: 'string[]',
    required: false,
    description:
      'Reference document or spec paths the skill cites. Doctor warns on missing paths.',
  },
  assets: {
    field: 'assets',
    type: 'string[]',
    required: false,
    description:
      'Any other supporting file paths (templates, fixtures, etc.). Doctor warns on missing paths.',
  },
}

// ---------------------------------------------------------------------------
// Generator helpers
// ---------------------------------------------------------------------------

function genHookKindTable(): string {
  const header = '| Kind | Phase | Default | Description |\n|---|---|---|---|'
  const rows = hookKindValues.map((k) => {
    const m = HOOK_KIND_META[k]
    if (!m) return `| \`${k}\` | — | — | — |`
    return `| \`${k}\` | ${m.phase} | ${m.defaultEnabled ? 'enabled' : 'disabled'} | ${m.description} |`
  })
  return [header, ...rows].join('\n')
}

function genHookContextTable(): string {
  const descriptions: Record<string, string> = {
    kind: 'The `HookKind` enum value for this event',
    cwd: 'Absolute path to the current working directory',
    config: 'Resolved `ModelsConfig` — full models.json config object',
    env: 'Process environment variables as `Record<string, string>`',
    payload:
      'Event-specific data; shape varies by kind (see per-kind notes below)',
    profile:
      'active profile name resolved by the dispatcher for handlers that declare a `HookHandlerProfileManifest`; undefined for legacy handlers',
  }
  const header = '| Field | Type | Description |\n|---|---|---|'
  const rows = hookContextFields.map((f) => {
    return `| \`${f}\` | see schema | ${descriptions[f] ?? '—'} |`
  })
  return [header, ...rows].join('\n')
}

function genHookResultTable(): string {
  const types: Record<string, string> = {
    exitCode: '`0 \\| 1 \\| 2`',
    message: '`string?`',
    systemInsert: '`string?`',
    context: '`Record<string, unknown>?`',
  }
  const descriptions: Record<string, string> = {
    exitCode:
      '`0` = success/continue, `1` = non-blocking warn, `2` = blocking abort',
    message:
      'User-visible text written to the terminal/transcript by the entrypoint',
    systemInsert:
      'Model-visible directive injected via CC `additionalContext` (10 KB cap) or OC `transform()` prepend; never written to stdout',
    context:
      'Arbitrary key-value bag passed to subsequent handlers in the same dispatch',
  }
  const header = '| Field | Type | Description |\n|---|---|---|'
  const rows = hookResultFields.map((f) => {
    return `| \`${f}\` | ${types[f] ?? '—'} | ${descriptions[f] ?? '—'} |`
  })
  return [header, ...rows].join('\n')
}

function genSkillFieldTable(): string {
  const header =
    '| Field | Type | Req? | Default | Description |\n|---|---|---|---|---|'
  const rows = skillFrontmatterFields.map((f) => {
    const m = SKILL_FIELD_META[f]
    if (!m) return `| \`${f}\` | — | — | — | — |`
    const req = m.required ? 'yes' : 'no'
    const def = m.default ?? '—'
    return `| \`${f}\` | \`${m.type}\` | ${req} | ${def} | ${m.description} |`
  })
  return [header, ...rows].join('\n')
}

// ---------------------------------------------------------------------------
// Generated section builders
// ---------------------------------------------------------------------------

function buildHookAuthoringSection(): string {
  return `<!-- gen:start — managed by scripts/generate-authoring-md.ts; do not edit between markers -->

## All 21 HookKind values

The following table is generated from \`src/core/types.ts\` \`HookKind\` enum (${hookKindValues.length} values).

${genHookKindTable()}

> **Anvil HookKind vs CC HookEvent:** HookKind is Anvil's internal taxonomy. Claude Code maps each kind to a CC hook event at manifest generation time (see \`src/adapters/claude-code/manifest.ts\`). The CC vocabulary has 30 events and 5 handler types (\`command\`, \`function\`, \`stdio\`, \`sse\`, \`api\`) — Anvil's adapter currently wires handlers as \`command\` type.

## HookContext fields

Every handler receives a \`HookContext\` object. The table below is generated from the \`HookContext\` Zod schema.

${genHookContextTable()}

### Per-kind payload shapes

| HookKind | payload content |
|---|---|
| \`pre-tool-use\` | \`{ tool_name, tool_input }\` |
| \`post-tool-use\` | \`{ tool_name, tool_input, tool_response }\` |
| \`post-edit\` | \`{ tool_name: "Edit"\\|"Write"\\|"MultiEdit", tool_input: { file_path, ... } }\` — see \`src/hooks/handlers/post-edit-accumulator/payload.ts\` |
| \`on-large-output\` | \`LargeOutputPayload\` — \`{ toolName, toolResult, words, tokens, branch, cwd }\` |
| \`notification\` | \`{ message, level }\` |
| \`on-error\` | \`{ error_code, error_message, tool_name? }\` |
| All others | \`undefined\` or event-specific object |

## HookResult fields

The table below is generated from the \`HookResult\` Zod schema. \`HookResult\` uses \`.strict()\` — no extra fields are accepted.

${genHookResultTable()}

### Exit code semantics

| Code | Meaning | Dispatcher effect |
|---|---|---|
| \`0\` | SUCCESS | Continue normally |
| \`1\` | WARN | Log warning, continue |
| \`2\` | BLOCK | Abort the triggering action; show \`message\` to user |

The dispatcher uses **worst-wins** aggregation: if any registered handler for a kind returns \`2\`, the aggregate is \`2\`.

## Hook profiles

Set \`ANVIL_HOOK_PROFILE\` to override \`config.disabled.hooks\` at runtime:

| Profile | Behaviour |
|---|---|
| \`minimal\` | Security only: \`pre-commit\`, \`pre-push\`, \`prompt-guard\`, \`read-guard\`, \`workflow-guard\` |
| \`standard\` | Default — respects \`config.disabled.hooks\` from models.json |
| \`strict\` | All 21 hook kinds enabled |

## \`if:\` permission rule (Claude Code adapter)

CC supports an \`if:\` permission rule on each hook entry in the plugin manifest, which pre-filters invocations against the CC permission context (allowlists/denylists, tool-name globs, etc.) before the handler runs. In Anvil, \`if:\` is wired at manifest-generation time via the \`h.ifRules\` field on each hook registration — see \`src/adapters/claude-code/manifest.ts:37\` for how the value is serialized into the CC manifest, and \`src/skills/load-all.ts\` for where individual hook \`register()\` calls supply the rule. Skill frontmatter does **not** declare \`if:\` directly; the rule is adapter-managed at the hook layer.

When authoring a new hook, set \`ifRules\` if the hook should only fire for a specific tool subset or permission context. Omit it to have the hook always evaluated by the dispatcher.

## Disabling individual hooks

In \`.anvil/models.json\`:

\`\`\`json
{
  "disabled": {
    "hooks": ["post-tool-use", "context-monitor"]
  }
}
\`\`\`

Values must be valid \`HookKind\` strings. Stale tokens (removed kinds) now fail Zod validation at config load time.

## Handler timeout

Each handler has a hard 30-second abort timeout (configurable via \`hooks.timeout_seconds\` in models.json). Aborted handlers return a safe \`{exitCode: 0}\`. The \`anvil doctor\` "Hook latency budget" row surfaces handlers that exceeded 5 s (warn) or 30 s (fail) from \`~/.anvil/logs/hook-timings.jsonl\`.

<!-- gen:end -->
`
}

function buildSkillAuthoringSection(): string {
  return `<!-- gen:start — managed by scripts/generate-authoring-md.ts; do not edit between markers -->

## SkillFrontmatter field reference

The table below is generated from the \`SkillFrontmatter\` Zod schema in \`src/core/types.ts\`. This is the authoritative field list — the loader rejects any skill with missing required fields.

${genSkillFieldTable()}

> **Note:** \`SkillFrontmatter\` does **not** use \`.strict()\`. Unknown CC-native fields (e.g. \`color:\`) are stripped at parse time so skills remain forward-compatible with new CC spec additions.

## Description budget (1 536-char per-entry / 8 K total)

Claude Code silently drops selector keywords that exceed the per-entry cap. Anvil enforces a **512-char hard cap** on \`description\` (Warp parity). The doctor \`description-budget\` lint warns when a description exceeds 280 chars to encourage tighter copy.

Guidelines:
- Lead with the trigger scenario: _"Use when …"_
- List 2–4 concrete action keywords separated by em-dashes
- Keep the total across all your installed skills under 8 K characters

## \`\${CLAUDE_SKILL_DIR}\` path substitution

Inside a skill body, \`\${CLAUDE_SKILL_DIR}\` is replaced at load time by the absolute path to the directory containing the skill file. Use it to reference sibling assets without hardcoding paths:

\`\`\`markdown
See also: \${CLAUDE_SKILL_DIR}/examples/usage.md
\`\`\`

## Description-as-trigger doctrine

The \`description\` field is the primary routing signal. The intent router scores it against the user's prompt. Rules:

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

## \`user-invocable\` behaviour

| Value | Effect |
|---|---|
| \`true\` (default) | Skill appears in the \`/\` slash menu |
| \`false\` | Hidden from slash menu; still auto-routable and invocable via \`Skill({skill: "anvil:<slug>"})\` |

**New-skill rule:** every new skill that is a helper, sub-skill, or language overlay **must** explicitly set \`user-invocable: false\`. Leave it at \`true\` only for direct user entry points. \`anvil doctor\` warns when the user-invocable count exceeds 15.

## \`chains\` vs \`sub_skills\`

| Feature | \`sub_skills\` | \`chains\` |
|---|---|---|
| Composition model | Tree (skill-driven; parent owns children) | Peer pipeline (orchestrator-driven; linear) |
| Who orchestrates | The parent skill | The caller / orchestrator |
| Typical use | One skill contains sub-specialisms | Skills that run around another skill |
| Mutual exclusivity | Cannot be combined with \`chains\` | Cannot be combined with \`sub_skills\` |

Both fields default to \`[]\`. A skill with non-empty \`sub_skills\` AND non-empty \`chains\` is rejected at load time.

## Path-scoped injection (\`paths:\` field)

\`\`\`yaml
paths:
  - "**/*.ts"
  - "**/*.tsx"
\`\`\`

When \`paths:\` is set, CC injects this skill's body whenever an Edit/Write/MultiEdit touches a matching file. Used by \`skills/languages/<lang>/rules/\` overlays to deliver per-language guidance exactly when the user is editing a matching file. OpenCode ignores \`paths:\` (graceful fall-through to standing instructions).

## Model alias usage

Use provider-neutral aliases rather than hardcoded model IDs:

| Alias | Resolution |
|---|---|
| \`cheap\` | Fastest/cheapest model (e.g. Haiku) |
| \`balanced\` | Default balanced model (e.g. Sonnet) |
| \`best\` | Highest-capability model (e.g. Opus) |

Aliases are resolved by \`src/core/models/aliases.ts\` — update that file (not skill frontmatter) when the provider releases a new model.

<!-- gen:end -->
`
}

// ---------------------------------------------------------------------------
// File update logic
// ---------------------------------------------------------------------------

const GEN_START = '<!-- gen:start'
const GEN_END = '<!-- gen:end -->'

function injectSection(existing: string, generated: string): string {
  const startIdx = existing.indexOf(GEN_START)
  const endIdx = existing.indexOf(GEN_END)

  if (startIdx === -1 || endIdx === -1) {
    // No markers present — append at end
    return existing.trimEnd() + '\n\n' + generated + '\n'
  }

  const before = existing.slice(0, startIdx)
  const after = existing.slice(endIdx + GEN_END.length)
  return before + generated + after.replace(/^\n/, '')
}

function updateFile(
  filePath: string,
  newSection: string,
): { changed: boolean } {
  const existing = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : ''
  const updated = injectSection(existing, newSection)
  if (updated === existing) return { changed: false }
  if (!CHECK_MODE) {
    writeFileSync(filePath, updated, 'utf-8')
  }
  return { changed: true }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const hookMd = resolve(ROOT, 'docs', 'hook-authoring.md')
const skillMd = resolve(ROOT, 'docs', 'skill-authoring.md')

const hookResult = updateFile(hookMd, buildHookAuthoringSection())
const skillResult = updateFile(skillMd, buildSkillAuthoringSection())

if (CHECK_MODE) {
  const changed = [
    hookResult.changed && 'docs/hook-authoring.md',
    skillResult.changed && 'docs/skill-authoring.md',
  ].filter(Boolean)
  if (changed.length > 0) {
    console.error(
      `[generate-authoring-md] DRIFT DETECTED in: ${changed.join(', ')}`,
    )
    console.error('Run: bun run scripts/generate-authoring-md.ts')
    process.exit(1)
  }
  console.log(
    '[generate-authoring-md] OK — committed docs match generator output',
  )
  process.exit(0)
}

console.log(
  '[generate-authoring-md] hook-authoring.md',
  hookResult.changed ? 'updated' : 'no change',
)
console.log(
  '[generate-authoring-md] skill-authoring.md',
  skillResult.changed ? 'updated' : 'no change',
)
