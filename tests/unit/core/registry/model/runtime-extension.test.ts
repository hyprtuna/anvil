/**
 * ANV-0211 — Runtime Extension Test
 *
 * Asserts that registerSkillModel / registerAgentModel correctly override
 * seeded values and that extensions layer below user overrides.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  allRegisteredAgentNames,
  allRegisteredSkillNames,
  registerAgentModel,
  registerExtensionSkillAssignments,
  registerSkillModel,
  resolveAgentAssignment,
  resolveSkillAssignment,
  setAgentUserOverrides,
  setSkillUserOverrides,
} from '../../../../../src/core/registry/model-registry-index.js'
import {
  _resetAgentRegistryForTest,
  _resetSkillRegistryForTest,
} from '../../../../../src/core/registry/test-support.js'

afterEach(() => {
  _resetSkillRegistryForTest()
  _resetAgentRegistryForTest()
})

describe('registerSkillModel — extension layer', () => {
  it('returns undefined for an unregistered extension skill', () => {
    // only bundled skills are present; no extension entry for 'my-ext-skill'
    expect(resolveSkillAssignment('my-ext-skill')).toBeUndefined()
  })

  it('resolveSkillAssignment returns bundled entry for a seeded skill', () => {
    const result = resolveSkillAssignment('code-review')
    expect(result).toBeDefined()
    expect(result?.role).toBe('review')
  })

  it('registerSkillModel overrides bundled entry', () => {
    registerSkillModel('code-review', {
      role: 'small',
      intensity: 'low',
      model: 'haiku',
      source: 'override',
    })
    const result = resolveSkillAssignment('code-review')
    expect(result?.role).toBe('small')
    expect(result?.model).toBe('haiku')
  })

  it('registerSkillModel adds a new extension skill not in bundled', () => {
    registerSkillModel('my-extension-skill', {
      role: 'coding',
      intensity: 'standard',
      model: 'sonnet',
      effort: 'medium',
      source: 'override',
    })
    const result = resolveSkillAssignment('my-extension-skill')
    expect(result?.role).toBe('coding')
    expect(result?.model).toBe('sonnet')
  })

  it('_resetSkillRegistryForTest clears extension entries', () => {
    registerSkillModel('my-extension-skill', {
      role: 'coding',
      source: 'override',
    })
    _resetSkillRegistryForTest()
    expect(resolveSkillAssignment('my-extension-skill')).toBeUndefined()
  })

  it('user overrides win over extension registrations', () => {
    // Extension registers first
    registerSkillModel('code-review', {
      role: 'small',
      model: 'haiku',
      source: 'override',
    })
    // User override takes highest precedence
    setSkillUserOverrides({
      'code-review': {
        role: 'autonomous',
        model: 'opus',
        effort: 'max',
        source: 'override',
      },
    })
    const result = resolveSkillAssignment('code-review')
    expect(result?.role).toBe('autonomous')
    expect(result?.model).toBe('opus')
  })

  it('user overrides win over bundled entries', () => {
    setSkillUserOverrides({
      'brainstorm-spec': {
        role: 'coding',
        model: 'sonnet',
        source: 'override',
      },
    })
    const result = resolveSkillAssignment('brainstorm-spec')
    expect(result?.role).toBe('coding')
    expect(result?.model).toBe('sonnet')
  })

  it('registerExtensionSkillAssignments registers multiple entries at once', () => {
    registerExtensionSkillAssignments({
      'ext-skill-a': { role: 'coding', source: 'override' },
      'ext-skill-b': { role: 'review', source: 'override' },
    })
    expect(resolveSkillAssignment('ext-skill-a')?.role).toBe('coding')
    expect(resolveSkillAssignment('ext-skill-b')?.role).toBe('review')
  })

  it('allRegisteredSkillNames includes bundled and extension skills', () => {
    registerSkillModel('ext-only', { role: 'small', source: 'override' })
    const names = allRegisteredSkillNames()
    expect(names).toContain('code-review')
    expect(names).toContain('ext-only')
  })
})

describe('registerAgentModel — extension layer', () => {
  it('resolveAgentAssignment returns bundled entry', () => {
    const result = resolveAgentAssignment('ultra-worker')
    expect(result).toBeDefined()
    expect(result?.role).toBe('autonomous')
    expect(result?.max_tokens).toBe(32768)
  })

  it('registerAgentModel overrides bundled entry', () => {
    registerAgentModel('ultra-worker', {
      role: 'coding',
      model: 'sonnet',
      source: 'override',
    })
    const result = resolveAgentAssignment('ultra-worker')
    expect(result?.role).toBe('coding')
    expect(result?.model).toBe('sonnet')
  })

  it('user overrides win over extension agent entries', () => {
    registerAgentModel('orchestrator', {
      role: 'small',
      model: 'haiku',
      source: 'override',
    })
    setAgentUserOverrides({
      orchestrator: {
        role: 'autonomous',
        model: 'opus',
        effort: 'max',
        source: 'override',
      },
    })
    const result = resolveAgentAssignment('orchestrator')
    expect(result?.role).toBe('autonomous')
    expect(result?.model).toBe('opus')
  })

  it('allRegisteredAgentNames includes all bundled agents', () => {
    const names = allRegisteredAgentNames()
    expect(names).toContain('ultra-worker')
    expect(names).toContain('orchestrator')
    expect(names).toContain('code-reviewer')
  })

  it('_resetAgentRegistryForTest clears extension entries', () => {
    registerAgentModel('my-ext-agent', { role: 'coding', source: 'override' })
    _resetAgentRegistryForTest()
    expect(resolveAgentAssignment('my-ext-agent')).toBeUndefined()
  })
})
