import { invokeSkill } from './common/invoke.js'

export interface DebugOptions {
  /**
   * Plan 38 Phase D — per-invocation tier injection.
   * Resolved by `resolveModel` as `cli.tier` (sits between session and ENV layers;
   * `--model` wins on conflict).
   */
  tier?: string
  /**
   * Plan 39 Phase F — GateGuard.
   * When true, sets ANVIL_GATEGUARD=1 so the gateguard hook handler activates
   * for this invocation only (transient; does not write config).
   */
  strict?: boolean
}

export async function debugCommand(
  issue: string,
  opts: DebugOptions = {},
): Promise<void> {
  if (opts.strict) {
    process.env.ANVIL_GATEGUARD = '1'
    process.stderr.write(
      '[anvil debug] --strict: GateGuard enabled for this invocation.\n',
    )
  }
  await invokeSkill('debugging', `Issue: ${issue}`, { tier: opts.tier })
}
