import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EXPECTED_TOKENS_WARN,
  aggregateExpectedTokens,
  formatExpectedTokensSummary,
  shouldWarnBundle,
} from '../../../src/core/expected-tokens.js'
import type { Agent, Skill } from '../../../src/core/types.js'

/**
 * ANV-0114 — aggregator: pure helper that sums `expected_tokens` across the
 * selection, splits known/unknown buckets, and returns a stable payload
 * consumable by the installer summary line and the doctor coverage row.
 */

function skill(name: string, expected_tokens?: number): Skill {
  return {
    frontmatter: {
      name,
      kind: 'atomic',
      group: 'development',
      description: 'test skill',
      trigger: [],
      preferred_model: 'balanced',
      preferred_effort: 'medium',
      inputs: [],
      outputs: [],
      tools: [],
      chains: [],
      language: 'universal',
      tags: [],
      aliases: [],
      isHidden: false,
      'user-invocable': true,
      'disable-model-invocation': false,
      breaking_changes_in: [],
      userInvocable: true,
      disableModelInvocation: false,
      sourceProvenance: 'unknown',
      expected_tokens,
      // biome-ignore lint/suspicious/noExplicitAny: fixture cast for test only
    } as any,
    body: 'body',
    sourcePath: `/skills/${name}.md`,
    scope: 'bundled',
  }
}

function agent(name: string, expected_tokens?: number): Agent {
  return {
    frontmatter: {
      name,
      description: 'test agent',
      model: 'inherit',
      tools: [],
      trigger: [],
      max_turns: 20,
      fallback_chain: [],
      agent_mode: 'subagent',
      expected_tokens,
      // biome-ignore lint/suspicious/noExplicitAny: fixture cast for test only
    } as any,
    body: 'body',
    sourcePath: `/agents/${name}.md`,
  }
}

describe('aggregateExpectedTokens', () => {
  it('returns all-zero counts for empty input', () => {
    const result = aggregateExpectedTokens([], [])
    expect(result.totalKnown).toBe(0)
    expect(result.knownSkillCount).toBe(0)
    expect(result.knownAgentCount).toBe(0)
    expect(result.unknownSkillCount).toBe(0)
    expect(result.unknownAgentCount).toBe(0)
    expect(result.skillCount).toBe(0)
    expect(result.agentCount).toBe(0)
  })

  it('sums skills + agents that declare expected_tokens', () => {
    const skills = [skill('a', 10_000), skill('b', 5_000)]
    const agents = [agent('x', 20_000), agent('y', 3_000)]
    const r = aggregateExpectedTokens(skills, agents)
    expect(r.totalKnown).toBe(38_000)
    expect(r.knownSkillCount).toBe(2)
    expect(r.knownAgentCount).toBe(2)
    expect(r.unknownSkillCount).toBe(0)
    expect(r.unknownAgentCount).toBe(0)
  })

  it('separates skills/agents missing expected_tokens into the unknown bucket', () => {
    const skills = [skill('a', 10_000), skill('b'), skill('c')]
    const agents = [agent('x', 20_000), agent('y')]
    const r = aggregateExpectedTokens(skills, agents)
    expect(r.totalKnown).toBe(30_000)
    expect(r.knownSkillCount).toBe(1)
    expect(r.knownAgentCount).toBe(1)
    expect(r.unknownSkillCount).toBe(2)
    expect(r.unknownAgentCount).toBe(1)
    expect(r.skillCount).toBe(3)
    expect(r.agentCount).toBe(2)
  })

  it('treats zero as a declared value (not unknown)', () => {
    const skills = [skill('a', 0)]
    const r = aggregateExpectedTokens(skills, [])
    expect(r.totalKnown).toBe(0)
    expect(r.knownSkillCount).toBe(1)
    expect(r.unknownSkillCount).toBe(0)
  })
})

describe('shouldWarnBundle', () => {
  it('warns when totalKnown exceeds threshold', () => {
    expect(shouldWarnBundle({ totalKnown: 60_000 }, 50_000)).toBe(true)
  })

  it('does not warn at or below threshold (boundary is inclusive)', () => {
    expect(shouldWarnBundle({ totalKnown: 50_000 }, 50_000)).toBe(false)
    expect(shouldWarnBundle({ totalKnown: 40_000 }, 50_000)).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(shouldWarnBundle({ totalKnown: 1_000 }, 500)).toBe(true)
    expect(shouldWarnBundle({ totalKnown: 1_000 }, 1_500)).toBe(false)
  })
})

describe('formatExpectedTokensSummary', () => {
  it('renders the canonical "selected … = ~Xk expected tokens" line', () => {
    const summary = formatExpectedTokensSummary({
      totalKnown: 38_000,
      knownSkillCount: 12,
      knownAgentCount: 5,
      unknownSkillCount: 0,
      unknownAgentCount: 0,
      skillCount: 12,
      agentCount: 5,
    })
    expect(summary).toBe('selected 12 skills + 5 agents = ~38k expected tokens')
  })

  it('appends a parenthetical when some items lack expected_tokens', () => {
    const summary = formatExpectedTokensSummary({
      totalKnown: 30_000,
      knownSkillCount: 10,
      knownAgentCount: 2,
      unknownSkillCount: 4,
      unknownAgentCount: 1,
      skillCount: 14,
      agentCount: 3,
    })
    expect(summary).toContain('~30k expected tokens')
    expect(summary).toContain('5 with no declared budget')
  })

  it('drops the fractional-k for sub-1k totals', () => {
    const summary = formatExpectedTokensSummary({
      totalKnown: 500,
      knownSkillCount: 1,
      knownAgentCount: 0,
      unknownSkillCount: 0,
      unknownAgentCount: 0,
      skillCount: 1,
      agentCount: 0,
    })
    expect(summary).toContain('~500 expected tokens')
  })
})

describe('DEFAULT_EXPECTED_TOKENS_WARN', () => {
  it('defaults to 50,000', () => {
    expect(DEFAULT_EXPECTED_TOKENS_WARN).toBe(50_000)
  })
})
