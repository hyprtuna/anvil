/**
 * ANV-0176 — shared CLI helper for the auto-mode / accept-defaults flag pair.
 *
 * Every command that may emit a `${TEMPLATE:decisions}` block accepts
 * `--auto` / `--no-auto` and `--accept-defaults` / `--no-accept-defaults`.
 * Precedence: explicit CLI flag > env var (`ANVIL_AUTO=1`,
 * `ANVIL_AUTO_DEFAULTS=1`) > default `false`. This helper resolves the pair
 * via `resolveRuntimeContext` and — critically — syncs the resolved booleans
 * back into `process.env` so nested invocations (subagents, downstream skills)
 * pick the flags up without re-parsing.
 *
 * Layer 4 leaf. Pure on its inputs except for the env-sync side effect.
 */

import {
  type RuntimeContext,
  resolveRuntimeContext,
} from '../../../core/runtime/context.js'

export interface AutoModeFlagInput {
  /** Parsed `--auto` / `--no-auto` value (undefined when flag absent). */
  auto?: boolean
  /** Parsed `--accept-defaults` / `--no-accept-defaults` value. */
  acceptDefaults?: boolean
}

/**
 * Resolves the auto-mode pair from CLI flags + env, then writes the result
 * back to env so nested processes / sub-invocations inherit the same policy.
 * Returns the resolved `RuntimeContext`. Idempotent.
 */
export function resolveAndSyncRuntimeContext(
  cli: AutoModeFlagInput,
  env: NodeJS.ProcessEnv = process.env,
): RuntimeContext {
  const ctx = resolveRuntimeContext({ env, cli })
  // Sync back to env so downstream `resolveRuntimeContext({env})` calls
  // (in nested invokeSkill / sub-agents) see the same booleans.
  env.ANVIL_AUTO = ctx.autoMode ? '1' : '0'
  env.ANVIL_AUTO_DEFAULTS = ctx.acceptDefaults ? '1' : '0'
  return ctx
}
