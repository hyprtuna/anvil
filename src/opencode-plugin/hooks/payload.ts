/**
 * Stdin/stdout JSON contract for OC hook invocations (spec D-03).
 *
 * Each .cjs hook receives a JSON document on stdin describing the tool call
 * context. The shape differs between before and after events.
 *
 * Hooks return a HookResult-shaped JSON document on stdout.
 */

import { z } from 'zod'
import { HookKind, HookResult } from '../../core/types.js'

// ─── Env allowlist ────────────────────────────────────────────────────────────

/**
 * Build a safe subset of process.env to forward to hook child processes.
 *
 * Threat model: a malicious hook in a cloned repo (repo-local .anvil/hooks/*.cjs
 * overrides global by basename) must not receive secrets that happen to be set
 * in the parent process (e.g. ANTHROPIC_API_KEY, AWS_SECRET_ACCESS_KEY).
 *
 * Allowlisted prefixes/names:
 *   PATH, HOME, USER, LANG, LC_*, TZ, TMPDIR, ANVIL_*
 *   NODE_* (excluding NODE_OPTIONS — used for --require injection attacks)
 */
export function buildSafeEnv(): Record<string, string> {
  const safe: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== 'string') continue
    if (
      key === 'PATH' ||
      key === 'HOME' ||
      key === 'USER' ||
      key === 'LANG' ||
      key === 'TZ' ||
      key === 'TMPDIR' ||
      key.startsWith('LC_') ||
      key.startsWith('ANVIL_') ||
      (key.startsWith('NODE_') && key !== 'NODE_OPTIONS')
    ) {
      safe[key] = value
    }
  }
  return safe
}

// ─── Payload schemas ─────────────────────────────────────────────────────────

const BaseInnerPayload = z.object({
  sessionID: z.string(),
  callID: z.string(),
  tool: z.string().min(1),
  args: z.unknown(),
})

/**
 * Payload written to stdin of tool.execute.before hooks.
 * Mirrors HookContext shape used by CC handlers (spec D-03).
 */
export const BeforePayload = z.object({
  kind: HookKind,
  surface: z.literal('opencode'),
  cwd: z.string(),
  env: z.record(z.string(), z.string()),
  payload: BaseInnerPayload,
})
export type BeforePayload = z.infer<typeof BeforePayload>

/**
 * Payload written to stdin of tool.execute.after hooks.
 * Extends BeforePayload with execution result fields.
 */
export const AfterPayload = BeforePayload.extend({
  payload: BaseInnerPayload.extend({
    output: z.string(),
    error: z.string().optional(),
    durationMs: z.number(),
  }),
})
export type AfterPayload = z.infer<typeof AfterPayload>

/** Re-export HookResult for dispatcher convenience */
export { HookResult }
export type HookResultType = z.infer<typeof HookResult>

// ─── OC handler input types (from reference plugin-interface.ts) ─────────────

/** Input shape for tool.execute.before (confirmed B1.1) */
export interface OcBeforeInput {
  tool: string
  sessionID: string
  callID: string
}

/** Output shape for tool.execute.before (mutable by hooks) */
export interface OcBeforeOutput {
  args: Record<string, unknown>
  message?: string
}

/** Input shape for tool.execute.after (confirmed B1.1) */
export interface OcAfterInput {
  tool: string
  sessionID: string
  callID: string
}

/** Output shape for tool.execute.after (mutable by hooks) */
export interface OcAfterOutput {
  title: string
  output: string
  metadata: Record<string, unknown>
}

// ─── Payload factories ────────────────────────────────────────────────────────

/**
 * Build and validate a BeforePayload from OC's tool.execute.before handler args.
 *
 * Throws ZodError when input doesn't satisfy the schema (e.g. non-string tool).
 */
export function buildBeforePayload(
  kind: string,
  input: OcBeforeInput,
  output: OcBeforeOutput,
  cwd: string,
): BeforePayload {
  const raw = {
    kind,
    surface: 'opencode',
    cwd,
    env: buildSafeEnv(),
    payload: {
      sessionID: input.sessionID,
      callID: input.callID,
      tool: input.tool,
      args: output.args,
    },
  }
  return BeforePayload.parse(raw)
}

/**
 * Build and validate an AfterPayload from OC's tool.execute.after handler args.
 *
 * `args` is the original tool args from the before-call (captured by the dispatcher).
 * Throws ZodError when input doesn't satisfy the schema.
 */
export function buildAfterPayload(
  kind: string,
  input: OcAfterInput,
  output: OcAfterOutput,
  cwd: string,
  durationMs: number,
  args: unknown = {},
): AfterPayload {
  const raw = {
    kind,
    surface: 'opencode',
    cwd,
    env: buildSafeEnv(),
    payload: {
      sessionID: input.sessionID,
      callID: input.callID,
      tool: input.tool,
      args,
      output: output.output,
      durationMs,
    },
  }
  return AfterPayload.parse(raw)
}
