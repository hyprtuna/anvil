import { describe, expect, it } from 'vitest'
import { checkAgentMigrationCompleteness } from '../../../../src/core/doctor/tier-integrity.js'
import type {
  AgentFrontmatterMap,
  AgentOverride,
} from '../../../../src/core/doctor/tier-integrity.js'

describe('checkAgentMigrationCompleteness', () => {
  it('fails when an agent has model: in frontmatter but is NOT in defaults agents block', () => {
    const agentMap: AgentFrontmatterMap = new Map([['foo', { model: 'opus' }]])
    const defaultsBlock: Record<string, AgentOverride> = {}
    const result = checkAgentMigrationCompleteness(agentMap, defaultsBlock)
    expect(result.status).toBe('fail')
    expect(result.offenders).toEqual(['foo'])
  })

  it('passes when an agent has model: in frontmatter AND is documented in defaults agents block', () => {
    const agentMap: AgentFrontmatterMap = new Map([['foo', { model: 'opus' }]])
    const defaultsBlock: Record<string, AgentOverride> = {
      foo: { tier: 'planning' }, // intentional override documented
    }
    const result = checkAgentMigrationCompleteness(agentMap, defaultsBlock)
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })

  it('passes when all agents use tier: only (no model: in frontmatter)', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['orchestrator', { tier: 'planning' }],
      ['ultra-worker', { tier: 'ultra' }],
      ['code-reviewer', { tier: 'review' }],
    ])
    const defaultsBlock: Record<string, AgentOverride> = {}
    const result = checkAgentMigrationCompleteness(agentMap, defaultsBlock)
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })

  it('passes for an empty agent map', () => {
    const result = checkAgentMigrationCompleteness(new Map(), {})
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })

  it('passes when agent has neither model: nor tier:', () => {
    const agentMap: AgentFrontmatterMap = new Map([['no-fields', {}]])
    const result = checkAgentMigrationCompleteness(agentMap, {})
    expect(result.status).toBe('pass')
  })

  it('lists all undocumented model: agents as offenders', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['agent-a', { model: 'opus' }],
      ['agent-b', { model: 'sonnet' }],
      ['agent-c', { tier: 'review' }], // safe
    ])
    const defaultsBlock: Record<string, AgentOverride> = {}
    const result = checkAgentMigrationCompleteness(agentMap, defaultsBlock)
    expect(result.status).toBe('fail')
    expect(result.offenders).toHaveLength(2)
    expect(result.offenders).toContain('agent-a')
    expect(result.offenders).toContain('agent-b')
    expect(result.offenders).not.toContain('agent-c')
  })

  it('passes when some agents have model: and all are documented in defaults', () => {
    const agentMap: AgentFrontmatterMap = new Map([
      ['agent-a', { model: 'opus' }],
      ['agent-b', { tier: 'coding' }],
    ])
    const defaultsBlock: Record<string, AgentOverride> = {
      'agent-a': { model: 'opus' },
    }
    const result = checkAgentMigrationCompleteness(agentMap, defaultsBlock)
    expect(result.status).toBe('pass')
    expect(result.offenders).toHaveLength(0)
  })
})
