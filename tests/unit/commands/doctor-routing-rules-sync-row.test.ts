/**
 * ANV-0067 — doctor "routing-rules sync" row unit tests.
 *
 * The row compares ROUTING_INTENT_TABLE (in routing-rules-content.ts) against
 * INTENT_DEFINITIONS (in intents.ts). A divergence means the generated file
 * was hand-edited after the last regeneration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// We mock both imports so tests can inject synthetic data without touching disk.
vi.mock('../../../src/core/routing-rules-content.js', () => ({
  ROUTING_INTENT_TABLE: [] as Array<{
    intent: string
    phrase: string
    agent: string
    skills: readonly string[]
  }>,
  ANVIL_ROUTING_RULES_CONTENT: '',
  ANVIL_OC_ROUTING_CONTENT: '',
  OC_ROUTING_MARKER_OPEN: '<!-- anvil-routing -->',
  OC_ROUTING_MARKER_CLOSE: '<!-- /anvil-routing -->',
  extractReferencedSlugs: () => [],
  findUnknownSlugs: () => [],
}))

vi.mock('../../../src/intent/intents.js', () => ({
  INTENT_DEFINITIONS: {} as Record<string, unknown>,
  INTENT_NAMES: [] as string[],
}))

import { pushRoutingRulesSyncCheck } from '../../../src/commands/cli/doctor.js'
import { ROUTING_INTENT_TABLE } from '../../../src/core/routing-rules-content.js'
import {
  INTENT_DEFINITIONS,
  INTENT_NAMES,
} from '../../../src/intent/intents.js'

// Cast to mutable for test injection
const mutableTable = ROUTING_INTENT_TABLE as Array<{
  intent: string
  phrase: string
  agent: string
  skills: readonly string[]
}>
const mutableDefs = INTENT_DEFINITIONS as Record<
  string,
  {
    name: string
    phrase: string
    defaultAgent: string
    defaultSkills: string[]
  }
>
const mutableNames = INTENT_NAMES as string[]

function resetMocks(): void {
  mutableTable.length = 0
  for (const key of Object.keys(mutableDefs)) {
    delete mutableDefs[key]
  }
  mutableNames.length = 0
}

describe('pushRoutingRulesSyncCheck', () => {
  beforeEach(() => {
    resetMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('passes when ROUTING_INTENT_TABLE is empty and INTENT_NAMES is empty', () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('routing-rules sync')
    expect(checks[0].status).toBe('pass')
  })

  it('passes when table entries agree with INTENT_DEFINITIONS', () => {
    mutableNames.push('review')
    mutableDefs.review = {
      name: 'review',
      phrase: 'review / audit / quality',
      defaultAgent: 'code-reviewer',
      defaultSkills: ['code-review', 'security-auditing'],
    }
    mutableTable.push({
      intent: 'review',
      phrase: 'review / audit / quality',
      agent: 'code-reviewer',
      skills: ['code-review', 'security-auditing'],
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('agrees with INTENT_DEFINITIONS')
  })

  it('fails when agent in table differs from defaultAgent in INTENT_DEFINITIONS', () => {
    mutableNames.push('review')
    mutableDefs.review = {
      name: 'review',
      phrase: 'review / audit / quality',
      defaultAgent: 'code-reviewer',
      defaultSkills: ['code-review'],
    }
    mutableTable.push({
      intent: 'review',
      phrase: 'review / audit / quality',
      agent: 'wrong-agent', // hand-edited
      skills: ['code-review'],
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('agent')
    expect(checks[0].detail).toContain('generate:routing-rules')
  })

  it('fails when phrase in table differs from phrase in INTENT_DEFINITIONS', () => {
    mutableNames.push('review')
    mutableDefs.review = {
      name: 'review',
      phrase: 'review / audit / quality',
      defaultAgent: 'code-reviewer',
      defaultSkills: ['code-review'],
    }
    mutableTable.push({
      intent: 'review',
      phrase: 'hand-edited phrase', // hand-edited
      agent: 'code-reviewer',
      skills: ['code-review'],
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('phrase')
  })

  it('fails when table has a skill not in INTENT_DEFINITIONS.defaultSkills', () => {
    mutableNames.push('review')
    mutableDefs.review = {
      name: 'review',
      phrase: 'review / audit / quality',
      defaultAgent: 'code-reviewer',
      defaultSkills: ['code-review'],
    }
    mutableTable.push({
      intent: 'review',
      phrase: 'review / audit / quality',
      agent: 'code-reviewer',
      skills: ['code-review', 'fabricated-skill'],
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('fabricated-skill')
  })

  it('fails when table skills are reordered vs INTENT_DEFINITIONS.defaultSkills', () => {
    mutableNames.push('review')
    mutableDefs.review = {
      name: 'review',
      phrase: 'review / audit / quality',
      defaultAgent: 'code-reviewer',
      defaultSkills: ['code-review', 'security-auditing'],
    }
    mutableTable.push({
      intent: 'review',
      phrase: 'review / audit / quality',
      agent: 'code-reviewer',
      skills: ['security-auditing', 'code-review'], // order swapped
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('security-auditing')
  })

  it('fails when table is missing a skill present in INTENT_DEFINITIONS.defaultSkills', () => {
    mutableNames.push('review')
    mutableDefs.review = {
      name: 'review',
      phrase: 'review / audit / quality',
      defaultAgent: 'code-reviewer',
      defaultSkills: ['code-review', 'security-auditing'],
    }
    mutableTable.push({
      intent: 'review',
      phrase: 'review / audit / quality',
      agent: 'code-reviewer',
      skills: ['code-review'], // security-auditing dropped
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('security-auditing')
  })

  it('fails when INTENT_NAMES has an intent missing from the table', () => {
    mutableNames.push('plan')
    mutableDefs.plan = {
      name: 'plan',
      phrase: 'plan / break down / decompose / design',
      defaultAgent: 'code-architect',
      defaultSkills: ['plan-writing'],
    }
    // Table is empty — intent is missing

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('"plan"')
  })

  it('fails when table has an orphan entry not in INTENT_DEFINITIONS', () => {
    // Table has "ghost-intent" but INTENT_NAMES/INTENT_DEFINITIONS are empty
    mutableTable.push({
      intent: 'ghost-intent',
      phrase: 'ghost',
      agent: 'ghost-worker',
      skills: [],
    })

    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks[0].status).toBe('fail')
    expect(checks[0].detail).toContain('orphan entry')
  })

  it('always pushes exactly one check row', () => {
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushRoutingRulesSyncCheck(checks)
    expect(checks).toHaveLength(1)
  })
})
