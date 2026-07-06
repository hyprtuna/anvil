import { z } from 'zod'

/**
 * Plan 28 Phase G — Zod schema for `.claude/settings.json`.
 *
 * This is a *lint* schema for `anvil settings validate` — it covers the
 * subset of CC settings Anvil emits + reads, plus the most commonly
 * hand-edited fields. Unknown top-level keys are passed through (CC's
 * own JSON Schema is the source of truth for the long tail) and
 * `hooks` validates as a loose object since the strict event/handler
 * shape already lives in `claude-code.ts → ClaudeCodePluginManifest`
 * and is exercised by the wire-merge code path.
 *
 * Fields covered: `permissions`, `hooks`, `statusLine`, `effortLevel`,
 * `disableAllHooks`, `_anvilNotes`, `$schema`, `outputStyle`, `sandbox`,
 * `env`, `model`. Any other key parses cleanly via `.passthrough()` so
 * we don't break users who add fields the published schema added after
 * Anvil's last release.
 *
 * See `references/claude-docs/settings/settings.md` for the full set;
 * the doc enumerates >80 top-level keys, of which we only validate the
 * ones Anvil generates or is likely to be asked about.
 */

const PermissionMode = z.enum([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'dontAsk',
  'bypassPermissions',
])
export type PermissionMode = z.infer<typeof PermissionMode>

const PermissionsBlock = z
  .object({
    allow: z.array(z.string()).optional(),
    ask: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
    additionalDirectories: z.array(z.string()).optional(),
    defaultMode: PermissionMode.optional(),
    disableBypassPermissionsMode: z.literal('disable').optional(),
    skipDangerousModePermissionPrompt: z.boolean().optional(),
  })
  .passthrough()

const StatusLineBlock = z
  .object({
    type: z.enum(['command', 'static']).optional(),
    command: z.string().optional(),
    padding: z.number().int().min(0).optional(),
    refreshInterval: z.number().int().min(0).optional(),
  })
  .passthrough()

/**
 * Loose hook entry shape — mirrors the wire-time shape but does not
 * enforce the discriminated union over handler types. Strict
 * validation lives in `ClaudeCodePluginManifest`. We only enforce
 * "looks like an array of objects with optional matcher + hooks".
 */
const HookEntry = z
  .object({
    matcher: z.string().optional(),
    hooks: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .passthrough()

const SandboxBlock = z
  .object({
    enabled: z.boolean().optional(),
    failIfUnavailable: z.boolean().optional(),
    autoAllowBashIfSandboxed: z.boolean().optional(),
    excludedCommands: z.array(z.string()).optional(),
    allowUnsandboxedCommands: z.boolean().optional(),
    filesystem: z
      .object({
        allowWrite: z.array(z.string()).optional(),
        denyWrite: z.array(z.string()).optional(),
        denyRead: z.array(z.string()).optional(),
        allowRead: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    network: z
      .object({
        allowUnixSockets: z.array(z.string()).optional(),
        allowAllUnixSockets: z.boolean().optional(),
        allowLocalBinding: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

export const ClaudeCodeSettings = z
  .object({
    $schema: z.string().optional(),
    permissions: PermissionsBlock.optional(),
    hooks: z.record(z.string(), z.array(HookEntry)).optional(),
    statusLine: StatusLineBlock.optional(),
    effortLevel: z.enum(['low', 'medium', 'high', 'xhigh']).optional(),
    disableAllHooks: z.boolean().optional(),
    outputStyle: z.string().optional(),
    sandbox: SandboxBlock.optional(),
    env: z.record(z.string(), z.string()).optional(),
    model: z.string().optional(),
    /**
     * Anvil-private hint block — not interpreted by CC. Used by
     * `anvil init` to leave a discoverable note about commented-out
     * features (sandbox, outputStyle) that the user can opt into.
     */
    _anvilNotes: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export type ClaudeCodeSettingsT = z.infer<typeof ClaudeCodeSettings>

/**
 * The CC-published JSON Schema URL. We point `$schema` here when emitting
 * a fresh `.claude/settings.json` so editors give autocomplete out of the
 * box.
 */
export const CC_SETTINGS_SCHEMA_URL =
  'https://json.schemastore.org/claude-code-settings.json' as const

/**
 * Map an Anvil preset name to the CC `permissions.defaultMode` we want
 * to emit on a fresh install. Conservative defaults — we never emit
 * `bypassPermissions`. `speed-first` is the only preset that opts
 * into `acceptEdits` (the closest documented mode to "fewer prompts");
 * everything else stays on `default` / `ask`-equivalent behaviour.
 */
export function presetToDefaultMode(preset: string): PermissionMode {
  switch (preset) {
    case 'speed-first':
      return 'acceptEdits'
    case 'balanced':
    case 'max-quality':
    case 'cost-optimised':
      return 'default'
    default:
      return 'default'
  }
}
