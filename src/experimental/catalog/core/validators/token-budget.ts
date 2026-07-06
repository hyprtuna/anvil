/**
 * ANV-0028 (P3) — Validator 9: token-budget
 *
 * Checks that the sum of all inventory item token_estimates does not exceed
 * ANVIL_TOKEN_BUDGET (default 20,000).
 *
 * Severity: warn.
 *
 * Layer 0 — pure; reads env var.
 */

import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const TOKEN_BUDGET_VALIDATOR_ID = 'token-budget'

export const DEFAULT_TOKEN_BUDGET = 20_000

export async function validateTokenBudget(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const budget = ctx.tokenBudget

  const total = record.inventory.reduce(
    (sum, item) => sum + item.token_estimate,
    0,
  )

  if (total <= budget) {
    return {
      id: TOKEN_BUDGET_VALIDATOR_ID,
      severity: 'warn',
      status: 'pass',
      message: `total token estimate ${total.toLocaleString()} is within budget of ${budget.toLocaleString()}`,
    }
  }

  return {
    id: TOKEN_BUDGET_VALIDATOR_ID,
    severity: 'warn',
    status: 'fail',
    message: `total token estimate ${total.toLocaleString()} exceeds budget of ${budget.toLocaleString()} (set ANVIL_TOKEN_BUDGET to override)`,
    detail: { total, budget, excess: total - budget },
  }
}
