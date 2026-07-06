import { describe, expect, it } from 'vitest'
import { checkTierNameValidity } from '../../../../src/core/doctor/tier-integrity.js'
import type { AgentFrontmatterMap } from '../../../../src/core/doctor/tier-integrity.js'

describe('checkTierNameValidity', () => {
  it('returns fail when agent has legacy tier "standard"', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['foo', { tier: 'standard' }],
    ])
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('fail')
    expect(result.offenders).toEqual(['foo'])
  })

  it('returns fail when agent has legacy tier "deep"', () => {
    const agentMap: AgentFrontmatterMap = new Map([['bar', { tier: 'deep' }]])
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('fail')
    expect(result.offenders).toEqual(['bar'])
  })

  it('returns pass when agent has canonical tier "planning"', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['foo', { tier: 'planning' }],
    ])
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })

  it('returns pass when agent has no tier field (resolver falls back to defaults)', () => {
    const agentMap: AgentFrontmatterMap = new Map([['foo', {}]])
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })

  it('returns pass for empty map', () => {
    const agentMap: AgentFrontmatterMap = new Map()
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })

  it('passes for all 6 canonical tier names', () => {
    const validTiers = [
      'quick',
      'coding',
      'review',
      'planning',
      'ultra',
      'super',
    ]
    for (const tier of validTiers) {
      const agentMap: AgentFrontmatterMap = new Map([['agent-x', { tier }]])
      const result = checkTierNameValidity(agentMap)
      expect(result.status, `tier '${tier}' should be valid`).toBe('pass')
    }
  })

  it('fails only the invalid agent when mixed with a valid one', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['good-agent', { tier: 'coding' }],
      ['bad-agent', { tier: 'standard' }],
    ])
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('fail')
    expect(result.offenders).toEqual(['bad-agent'])
    expect(result.offenders).not.toContain('good-agent')
  })

  it('lists all offenders when multiple agents have invalid tiers', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['agent-a', { tier: 'standard' }],
      ['agent-b', { tier: 'deep' }],
      ['agent-c', { tier: 'ultra' }], // valid
    ])
    const result = checkTierNameValidity(agentMap)
    expect(result.status).toBe('fail')
    expect(result.offenders).toHaveLength(2)
    expect(result.offenders).toContain('agent-a')
    expect(result.offenders).toContain('agent-b')
  })
})
