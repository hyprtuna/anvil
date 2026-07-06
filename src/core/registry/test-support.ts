/**
 * ANV-0211 — Registry test support helpers
 *
 * Exports the reset helpers for tests. These are intentionally NOT in the
 * public barrel (model-registry-index.ts) — they must only be imported in
 * test files, never in production code.
 *
 * Usage in tests:
 *   import { _resetSkillRegistryForTest, _resetAgentRegistryForTest }
 *     from '../../src/core/registry/test-support.js'
 */

export { _resetSkillRegistryForTest } from './skill-model-registry.js'
export { _resetAgentRegistryForTest } from './agent-model-registry.js'
