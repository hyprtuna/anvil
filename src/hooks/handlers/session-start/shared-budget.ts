/**
 * Shared SessionStart budget coordination — ANV-0124 + ANV-0126 (Phase A).
 *
 * Both the rule-reinforcement injection (ANV-0124, fires on UserPromptSubmit)
 * and the pre-compact restore digest (ANV-0126, fires on SessionStart) need
 * a slice of the SessionStart context budget defined in ANV-0056. Without a
 * single source of truth they would compete for the same pool and silently
 * race under load.
 *
 * Approach:
 *   * The SessionStart aggregate budget (`SESSION_START_BUDGET_CHARS`, 6000)
 *     is the canonical char budget for everything injected on SessionStart.
 *   * Each cohabiting feature reserves a maximum fraction. The reservations
 *     are **declared here in one place** so the bookkeeping is auditable.
 *   * Helpers return *char* budgets (chars/4 ≈ tokens). Callers translate
 *     to tokens when their config is token-denominated (ANV-0124 uses tokens).
 *
 * Reservations (declared, not enforced — handlers are honor-system clamped):
 *
 * | Feature                                | Reservation |
 * |----------------------------------------|-------------|
 * | rule-reinforcement (UserPromptSubmit)  | 500 tokens (~2000 chars). UserPromptSubmit budget, not SessionStart, but co-declared here so the model context view across the turn stays under one combined ceiling. |
 * | pre-compact restore digest (SessionStart) | 1500 chars (~375 tokens). Slice of the SessionStart aggregate. |
 *
 * Both reservations sum to roughly 3500 chars — comfortably below the 6000
 * default, leaving room for bootstrap context + routing hint.
 */

import { SESSION_START_BUDGET_CHARS } from './budget.js'

/** Approximate chars-per-token ratio used across Anvil (no tokenizer needed). */
export const CHARS_PER_TOKEN = 4

/**
 * Per-feature char ceilings inside the SessionStart aggregate.
 * Lower-priority features stay well under their slice so the bootstrap
 * + routing-hint fragments win the aggregator's priority sort.
 */
export const SHARED_BUDGET_RESERVATIONS = {
  /** Cap on the rule-reinforcement digest (UserPromptSubmit). */
  ruleReinforcementChars: 500 * CHARS_PER_TOKEN,
  /** Cap on the pre-compact restore digest emitted at SessionStart. */
  preCompactRestoreChars: 1500,
} as const

/**
 * Translate a token cap to a char budget for callers whose config uses tokens.
 */
export function tokensToChars(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0
  return Math.floor(tokens) * CHARS_PER_TOKEN
}

/**
 * Return the rule-reinforcement char budget, given a per-call token override.
 * Clamps to the declared maximum so a misconfigured value cannot starve other
 * fragments.
 */
export function reinforcementCharBudget(
  configuredTokens: number | undefined,
): number {
  const cap = SHARED_BUDGET_RESERVATIONS.ruleReinforcementChars
  if (configuredTokens === undefined) return cap
  const requested = tokensToChars(configuredTokens)
  if (requested === 0) return 0
  return Math.min(requested, cap)
}

/**
 * Return the pre-compact restore char budget. Currently a constant slice —
 * future ANV-0xxx may make this configurable via models.json.
 */
export function preCompactRestoreCharBudget(): number {
  return Math.min(
    SHARED_BUDGET_RESERVATIONS.preCompactRestoreChars,
    SESSION_START_BUDGET_CHARS,
  )
}
