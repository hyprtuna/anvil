import { z } from 'zod'

/**
 * Plan 28 Phase D3 — handler-type union. v0.4 ships `command` + `http`;
 * `prompt` and `agent` are stub-validated so config that references
 * them parses cleanly, but the dispatcher returns a "not implemented"
 * trace entry instead of executing them. Full semantics arrive in v0.5
 * alongside the matching prompt-evaluator and inline-agent surfaces.
 */
const HookCommand = z.object({
  type: z.literal('command'),
  command: z.string().min(1),
  timeout: z.number().int().positive().optional(),
})

const HookHttp = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  timeout: z.number().int().positive().optional(),
})

const HookPromptStub = z.object({
  type: z.literal('prompt'),
  prompt: z.string().min(1),
  timeout: z.number().int().positive().optional(),
})

const HookAgentStub = z.object({
  type: z.literal('agent'),
  agent: z.string().min(1),
  timeout: z.number().int().positive().optional(),
})

const HookHandlerSpec = z.discriminatedUnion('type', [
  HookCommand,
  HookHttp,
  HookPromptStub,
  HookAgentStub,
])
export type HookHandlerSpecT = z.infer<typeof HookHandlerSpec>

const HookMatcherEntry = z.object({
  matcher: z.string().optional(),
  /** Plan 28 Phase D2 — permission-rule predicate(s). */
  if: z.union([z.string(), z.array(z.string())]).optional(),
  hooks: z.array(HookHandlerSpec),
})

const HookEvent = z.enum([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'Notification',
  'Stop',
  'SubagentStop',
])

export const PLUGIN_MANIFEST_SCHEMA_URL =
  'https://anvil.dev/schemas/plugin-manifest/v1.json' as const

export const ClaudeCodePluginManifest = z.object({
  $schema: z.literal(PLUGIN_MANIFEST_SCHEMA_URL).optional(),
  schemaVersion: z.literal(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'semver required'),
  description: z.string().min(1),
  author: z
    .object({
      name: z.string(),
      email: z.string().optional(),
      url: z.string().optional(),
    })
    .optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  keywords: z.array(z.string()).optional(),
  hooks: z.record(z.string(), z.array(HookMatcherEntry)).optional(),
})

export type ClaudeCodePluginManifestT = z.infer<typeof ClaudeCodePluginManifest>

export const HOOK_KIND_TO_EVENT: Record<string, z.infer<typeof HookEvent>> = {
  'session-start': 'SessionStart',
  'session-end': 'SessionEnd',
  'user-prompt-submit': 'UserPromptSubmit',
  'pre-tool-use': 'PreToolUse',
  'post-tool-use': 'PostToolUse',
  'pre-compact': 'PreCompact',
  notification: 'Notification',
  stop: 'Stop',
  'subagent-stop': 'SubagentStop',
}
