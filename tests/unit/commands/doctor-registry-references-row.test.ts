import { describe, expect, it } from 'vitest'
import { validateModelsJsonReferences } from '../../../src/commands/cli/doctor.js'

/**
 * Plan 42 Phase B — anvil doctor "models.json registry references" row.
 *
 * Pre-v0.10.5: row was named "models.json skill references" and validated
 * group/override members against the skill registry only — failing on
 * shipped presets that legitimately reference agents (orchestrator,
 * researcher, framework-selector, etc.) as group members.
 *
 * v0.10.5 (Plan 42 D-01): row renamed; membership widened to skills ∪ agents.
 */
describe('doctor — models.json registry references row', () => {
  const skillSet = new Set(['development', 'testing', 'planning'])
  const agentSet = new Set(['orchestrator', 'researcher', 'code-reviewer'])

  it('passes when group members are skills', () => {
    const models = {
      groups: {
        coding: { members: ['development', 'testing'] },
      },
      overrides: {},
    }
    const result = validateModelsJsonReferences(models, skillSet, agentSet)
    expect(result.status).toBe('pass')
  })

  it('passes when group members are agents (regression — pre-v0.10.5 failed)', () => {
    const models = {
      groups: {
        review: { members: ['orchestrator', 'researcher', 'code-reviewer'] },
      },
      overrides: {},
    }
    const result = validateModelsJsonReferences(models, skillSet, agentSet)
    expect(result.status).toBe('pass')
  })

  it('passes when group members mix skills and agents', () => {
    const models = {
      groups: {
        planning: {
          members: ['planning', 'orchestrator', 'researcher'],
        },
      },
      overrides: {},
    }
    const result = validateModelsJsonReferences(models, skillSet, agentSet)
    expect(result.status).toBe('pass')
  })

  it('fails on a genuinely unknown name (neither skill nor agent)', () => {
    const models = {
      groups: {
        coding: { members: ['development', 'totally-fictional-name'] },
      },
      overrides: {},
    }
    const result = validateModelsJsonReferences(models, skillSet, agentSet)
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('totally-fictional-name')
  })

  it('passes when an override key matches a skill or agent name', () => {
    const models = {
      groups: {},
      overrides: {
        'code-reviewer': { model: 'opus' },
        development: { model: 'sonnet' },
      },
    }
    const result = validateModelsJsonReferences(models, skillSet, agentSet)
    expect(result.status).toBe('pass')
  })

  it('reports row name "models.json registry references"', () => {
    expect(validateModelsJsonReferences.rowName).toBe(
      'models.json registry references',
    )
  })
})
