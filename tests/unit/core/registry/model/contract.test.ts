/**
 * ANV-0211 — Registry Contract Test
 *
 * Asserts that the model registry exposes only the documented public API
 * (no leaky internals) and that the API surface is stable.
 *
 * Also validates the tierToAssignment helper covers all six legacy tiers.
 */

import { describe, expect, it } from 'vitest'
import * as registryIndex from '../../../../../src/core/registry/model-registry-index.js'
import { tierToAssignment } from '../../../../../src/core/registry/model-registry-index.js'
import type { LegacyTier } from '../../../../../src/core/registry/model-registry-index.js'

describe('model-registry-index public API surface', () => {
  // ANV-0211: _resetSkillRegistryForTest and _resetAgentRegistryForTest are removed
  // from the public barrel. They are now in test-support.ts and must only be
  // imported in test files, not in production code.
  const EXPECTED_EXPORTS = new Set([
    // Types (runtime-erased, won't appear, but document intent)
    // Functions
    'tierToAssignment',
    'registerSkillModel',
    'registerExtensionSkillAssignments',
    'setSkillUserOverrides',
    'resolveSkillAssignment',
    'allRegisteredSkillNames',
    'registerAgentModel',
    'registerExtensionAgentAssignments',
    'setAgentUserOverrides',
    'resolveAgentAssignment',
    'allRegisteredAgentNames',
    // Const registries
    'BUNDLED_SKILL_REGISTRY',
    'BUNDLED_AGENT_REGISTRY',
  ])

  it('exports all expected API members', () => {
    for (const name of EXPECTED_EXPORTS) {
      expect(
        Object.prototype.hasOwnProperty.call(registryIndex, name),
        `Expected export "${name}" to be present`,
      ).toBe(true)
    }
  })

  it('does not export unexpected internal names', () => {
    // Private maps (_extensionRegistry, _userOverrides) must not be exported
    const keys = Object.keys(registryIndex)
    const unexpected = keys.filter(
      (k) => k.startsWith('_') && !EXPECTED_EXPORTS.has(k),
    )
    expect(
      unexpected,
      `Unexpected internal exports: ${unexpected.join(', ')}`,
    ).toHaveLength(0)
  })

  it('BUNDLED_SKILL_REGISTRY is frozen (Object.isFrozen)', () => {
    expect(Object.isFrozen(registryIndex.BUNDLED_SKILL_REGISTRY)).toBe(true)
  })

  it('BUNDLED_AGENT_REGISTRY is frozen (Object.isFrozen)', () => {
    expect(Object.isFrozen(registryIndex.BUNDLED_AGENT_REGISTRY)).toBe(true)
  })
})

describe('tierToAssignment', () => {
  const LEGACY_TIERS: LegacyTier[] = [
    'quick',
    'coding',
    'review',
    'planning',
    'ultra',
    'super',
  ]

  it('handles all six legacy tier names without throwing', () => {
    for (const tier of LEGACY_TIERS) {
      expect(() => tierToAssignment(tier)).not.toThrow()
    }
  })

  it('quick maps to small/low', () => {
    const r = tierToAssignment('quick')
    expect(r.role).toBe('small')
    expect(r.intensity).toBe('low')
  })

  it('coding maps to coding/standard', () => {
    const r = tierToAssignment('coding')
    expect(r.role).toBe('coding')
    expect(r.intensity).toBe('standard')
  })

  it('review maps to review/standard', () => {
    const r = tierToAssignment('review')
    expect(r.role).toBe('review')
    expect(r.intensity).toBe('standard')
  })

  it('planning maps to planning/standard', () => {
    const r = tierToAssignment('planning')
    expect(r.role).toBe('planning')
    expect(r.intensity).toBe('standard')
  })

  it('ultra maps to autonomous/deep', () => {
    const r = tierToAssignment('ultra')
    expect(r.role).toBe('autonomous')
    expect(r.intensity).toBe('deep')
  })

  it('super maps to autonomous/max', () => {
    const r = tierToAssignment('super')
    expect(r.role).toBe('autonomous')
    expect(r.intensity).toBe('max')
  })

  it('both ultra and super produce role=autonomous (they are intensity dials, not separate roles)', () => {
    expect(tierToAssignment('ultra').role).toBe('autonomous')
    expect(tierToAssignment('super').role).toBe('autonomous')
  })
})

describe('resolveSkillAssignment return type contract', () => {
  it('returns a ModelAssignment with role for a known skill', () => {
    const result = registryIndex.resolveSkillAssignment('code-review')
    expect(result).toBeDefined()
    expect(typeof result?.role).toBe('string')
  })

  it('returns undefined for an unknown skill', () => {
    expect(
      registryIndex.resolveSkillAssignment('__non-existent-skill__'),
    ).toBeUndefined()
  })
})

describe('resolveAgentAssignment return type contract', () => {
  it('returns a ModelAssignment with role for a known agent', () => {
    const result = registryIndex.resolveAgentAssignment('ultra-worker')
    expect(result).toBeDefined()
    expect(typeof result?.role).toBe('string')
  })

  it('returns undefined for an unknown agent', () => {
    expect(
      registryIndex.resolveAgentAssignment('__non-existent-agent__'),
    ).toBeUndefined()
  })
})
