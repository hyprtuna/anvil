import { z } from 'zod'
import { invokeSkill } from './common/invoke.js'

const ReviewTypeOption = z
  .enum(['spec-compliance', 'code-quality', 'both'])
  .default('both')

export interface ReviewOptions {
  type?: 'spec-compliance' | 'code-quality' | 'both'
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

export async function reviewCommand(
  target?: string,
  opts?: ReviewOptions,
): Promise<void> {
  const type = ReviewTypeOption.parse(opts?.type ?? 'both')
  if (opts?.strict) {
    process.env.ANVIL_GATEGUARD = '1'
    process.stderr.write(
      '[anvil review] --strict: GateGuard enabled for this invocation.\n',
    )
  }
  await invokeSkill(
    'code-review',
    `Target: ${target ?? 'staged'}\nReviewType: ${type}`,
    { tier: opts?.tier },
  )
}
