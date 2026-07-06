/**
 * Tests for shared-budget — ANV-0124 + ANV-0126 (Phase A).
 *
 * Single source of truth for budget partitioning between rule-reinforcement
 * and pre-compact restore. The two features cohabit the same SessionStart
 * context window and must not compete for the same chars.
 */
import { describe, expect, it } from 'vitest'
import {
  CHARS_PER_TOKEN,
  SHARED_BUDGET_RESERVATIONS,
  preCompactRestoreCharBudget,
  reinforcementCharBudget,
  tokensToChars,
} from '../../../../../src/hooks/handlers/session-start/shared-budget.js'

describe('shared-budget', () => {
  it('declares both reservations as positive char budgets', () => {
    expect(SHARED_BUDGET_RESERVATIONS.ruleReinforcementChars).toBeGreaterThan(0)
    expect(SHARED_BUDGET_RESERVATIONS.preCompactRestoreChars).toBeGreaterThan(0)
  })

  it('keeps the sum of reservations below the SessionStart aggregate budget', () => {
    const sum =
      SHARED_BUDGET_RESERVATIONS.ruleReinforcementChars +
      SHARED_BUDGET_RESERVATIONS.preCompactRestoreChars
    // The default aggregate (SESSION_START_BUDGET_CHARS) is 6000; cohabiting
    // reservations should not exceed it on their own.
    expect(sum).toBeLessThan(6000)
  })

  it('tokensToChars uses the documented 4:1 ratio', () => {
    expect(tokensToChars(100)).toBe(100 * CHARS_PER_TOKEN)
  })

  it('tokensToChars returns 0 for non-positive or non-finite input', () => {
    expect(tokensToChars(0)).toBe(0)
    expect(tokensToChars(-5)).toBe(0)
    expect(tokensToChars(Number.NaN)).toBe(0)
    expect(tokensToChars(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('reinforcementCharBudget defaults to the declared reservation cap', () => {
    expect(reinforcementCharBudget(undefined)).toBe(
      SHARED_BUDGET_RESERVATIONS.ruleReinforcementChars,
    )
  })

  it('reinforcementCharBudget honors a lower configured value', () => {
    expect(reinforcementCharBudget(100)).toBe(100 * CHARS_PER_TOKEN)
  })

  it('reinforcementCharBudget clamps a request above the reservation cap', () => {
    const huge = SHARED_BUDGET_RESERVATIONS.ruleReinforcementChars * 10
    expect(reinforcementCharBudget(huge)).toBe(
      SHARED_BUDGET_RESERVATIONS.ruleReinforcementChars,
    )
  })

  it('reinforcementCharBudget returns 0 when configured to 0 tokens', () => {
    expect(reinforcementCharBudget(0)).toBe(0)
  })

  it('preCompactRestoreCharBudget returns the declared slice', () => {
    expect(preCompactRestoreCharBudget()).toBe(
      SHARED_BUDGET_RESERVATIONS.preCompactRestoreChars,
    )
  })
})
