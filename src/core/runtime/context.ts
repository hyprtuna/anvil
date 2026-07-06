/**
 * ANV-0176 — RuntimeContext: session-scoped runtime knobs.
 *
 * Today the shape carries exactly two booleans:
 *
 *   - `autoMode`        — high-confidence decisions auto-select instead of
 *                          prompting the user. Source: `--auto` flag /
 *                          `ANVIL_AUTO=1` env var.
 *   - `acceptDefaults`  — broader "trust me, pick the recommended option
 *                          always" override (even at low/medium confidence).
 *                          Source: `--accept-defaults` flag /
 *                          `ANVIL_AUTO_DEFAULTS=1` env var.
 *
 * The two are orthogonal. Both default to `false` — auto-mode never engages
 * unless the operator explicitly opts in via flag or env.
 *
 * The shape is deliberately narrow so ANV-0175 (plan-runner autonomous
 * execution) can extend it with its own fields without conflicting here.
 * Layer 0 — Zod schema, pure resolver, no I/O.
 */

import { z } from 'zod'

export const RuntimeContext = z
  .object({
    autoMode: z.boolean().default(false),
    acceptDefaults: z.boolean().default(false),
  })
  .strict()

export type RuntimeContext = z.infer<typeof RuntimeContext>

/**
 * Inputs the resolver consults. `env` is typically `process.env` (filtered
 * to a `Record<string, string | undefined>`). `cli` carries the parsed
 * flags from the active CLI command — `auto` and `acceptDefaults` may be
 * `undefined` (flag absent), `true` (flag present), or `false` (negated
 * via `--no-auto` / `--no-accept-defaults`).
 *
 * Precedence per field, from highest to lowest:
 *   1. CLI flag (explicit `true` or explicit `false` wins outright).
 *   2. Env var equals literal `'1'`.
 *   3. Default `false`.
 */
export interface ResolveRuntimeContextInput {
  env: Record<string, string | undefined>
  cli: {
    auto?: boolean
    acceptDefaults?: boolean
  }
}

export function resolveRuntimeContext(
  input: ResolveRuntimeContextInput,
): RuntimeContext {
  const autoMode = resolveOne(input.cli.auto, input.env.ANVIL_AUTO)
  const acceptDefaults = resolveOne(
    input.cli.acceptDefaults,
    input.env.ANVIL_AUTO_DEFAULTS,
  )
  return RuntimeContext.parse({ autoMode, acceptDefaults })
}

function resolveOne(
  cliFlag: boolean | undefined,
  envValue: string | undefined,
): boolean {
  if (cliFlag !== undefined) return cliFlag
  return envValue === '1'
}
