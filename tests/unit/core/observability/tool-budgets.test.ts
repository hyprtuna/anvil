import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOOL_BUDGETS,
  FALLBACK_TOOL_BUDGET,
  ToolBudgets,
  applyToolOutputBudget,
  resolveToolBudget,
} from '../../../../src/core/observability/index.js'

describe('resolveToolBudget', () => {
  it('returns the matching budget (case-insensitive)', () => {
    expect(resolveToolBudget('webfetch')).toEqual(DEFAULT_TOOL_BUDGETS.webfetch)
    expect(resolveToolBudget('WebFetch')).toEqual(DEFAULT_TOOL_BUDGETS.webfetch)
  })

  it('falls back to FALLBACK_TOOL_BUDGET when no entry exists', () => {
    expect(resolveToolBudget('does-not-exist')).toEqual(FALLBACK_TOOL_BUDGET)
  })

  it('parses cleanly through ToolBudgets Zod schema', () => {
    expect(ToolBudgets.safeParse(DEFAULT_TOOL_BUDGETS).success).toBe(true)
  })
})

describe('applyToolOutputBudget', () => {
  it('returns the input unchanged when under budget', () => {
    const r = applyToolOutputBudget('bash', 'short result')
    expect(r.truncated).toBe(false)
    expect(r.directive).toBeNull()
    expect(r.text).toBe('short result')
  })

  it('truncates + emits context-risk-high when over budget', () => {
    // bash output_max_bytes = 1 MB. Use a tiny budget for the test.
    const budgets = {
      bash: { input_max_bytes: 1024, output_max_bytes: 200 },
    }
    const big = 'a'.repeat(2000)
    const r = applyToolOutputBudget('bash', big, budgets)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(200)
    expect(r.directive).not.toBeNull()
    expect(r.directive?.kind).toBe('context-risk-high')
    expect(r.directive?.severity).toBe('critical')
    if (r.directive?.kind === 'context-risk-high') {
      expect(r.directive.payload.usedPercent).toBe(100) // clamped
    }
  })

  it('caps usedPercent at 100 even when output dwarfs the budget', () => {
    const budgets = {
      tinytool: { input_max_bytes: 100, output_max_bytes: 100 },
    }
    const huge = 'x'.repeat(10_000)
    const r = applyToolOutputBudget('tinytool', huge, budgets)
    expect(r.directive?.kind).toBe('context-risk-high')
    if (r.directive?.kind === 'context-risk-high') {
      expect(r.directive.payload.usedPercent).toBe(100)
    }
  })

  it('reports the original byte size before truncation', () => {
    const budgets = {
      bash: { input_max_bytes: 1024, output_max_bytes: 50 },
    }
    const result = applyToolOutputBudget('bash', 'a'.repeat(500), budgets)
    expect(result.originalBytes).toBe(500)
    expect(result.truncated).toBe(true)
  })
})
