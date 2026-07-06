/**
 * ANV-0211 — Model Registry public API barrel
 *
 * Exports all public types and functions from the model registry modules.
 * Import from this barrel rather than directly from the individual files.
 *
 * Usage:
 *   import { resolveSkillAssignment, resolveAgentAssignment } from '../registry/model-registry-index.js'
 *
 * Test-only helpers (`_resetSkillRegistryForTest`, `_resetAgentRegistryForTest`) are
 * NOT exported from this barrel. Import them from `test-support.ts` in test files:
 *   import { _resetSkillRegistryForTest } from '../registry/test-support.js'
 */

export type {
  Role,
  Intensity,
  LegacyTier,
  ModelAssignment,
  RegistryEntry,
} from './model-registry-types.js'

export { tierToAssignment } from './model-registry-types.js'

export {
  BUNDLED_SKILL_REGISTRY,
  registerSkillModel,
  registerExtensionSkillAssignments,
  setSkillUserOverrides,
  resolveSkillAssignment,
  allRegisteredSkillNames,
} from './skill-model-registry.js'

export {
  BUNDLED_AGENT_REGISTRY,
  registerAgentModel,
  registerExtensionAgentAssignments,
  setAgentUserOverrides,
  resolveAgentAssignment,
  allRegisteredAgentNames,
} from './agent-model-registry.js'
