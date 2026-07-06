import { describe, expect, it } from 'vitest'
import { WorkflowConfig } from '../../../../src/core/types.js'

describe('WorkflowConfig', () => {
  it('parses an empty object and applies all 5 defaults', () => {
    const result = WorkflowConfig.parse({})
    expect(result.research_gate).toBe(false)
    expect(result.plan_check).toBe(true)
    expect(result.decision_coverage).toBe(true)
    expect(result.verification).toBe(true)
    expect(result.context_coverage).toBe(false)
  })

  it('accepts all 5 boolean flags explicitly set to true', () => {
    const result = WorkflowConfig.parse({
      research_gate: true,
      plan_check: true,
      decision_coverage: true,
      verification: true,
      context_coverage: true,
    })
    expect(result.research_gate).toBe(true)
    expect(result.plan_check).toBe(true)
    expect(result.decision_coverage).toBe(true)
    expect(result.verification).toBe(true)
    expect(result.context_coverage).toBe(true)
  })

  it('accepts all 5 boolean flags explicitly set to false', () => {
    const result = WorkflowConfig.parse({
      research_gate: false,
      plan_check: false,
      decision_coverage: false,
      verification: false,
      context_coverage: false,
    })
    expect(result.research_gate).toBe(false)
    expect(result.plan_check).toBe(false)
    expect(result.decision_coverage).toBe(false)
    expect(result.verification).toBe(false)
    expect(result.context_coverage).toBe(false)
  })

  it('allows a partial override — only specified fields change; others retain defaults', () => {
    const result = WorkflowConfig.parse({ research_gate: true })
    expect(result.research_gate).toBe(true)
    expect(result.plan_check).toBe(true) // default
    expect(result.decision_coverage).toBe(true) // default
    expect(result.verification).toBe(true) // default
    expect(result.context_coverage).toBe(false) // default
  })

  it('rejects a non-boolean value for research_gate', () => {
    expect(() => WorkflowConfig.parse({ research_gate: 'yes' })).toThrow()
  })

  it('rejects a non-boolean value for plan_check', () => {
    expect(() => WorkflowConfig.parse({ plan_check: 1 })).toThrow()
  })

  it('rejects a non-boolean value for verification', () => {
    expect(() => WorkflowConfig.parse({ verification: 'true' })).toThrow()
  })
})
