/**
 * ANV-0211 — Agent Model Registry
 *
 * `BUNDLED_AGENT_REGISTRY` is the compile-time-seeded source of truth for
 * default model assignments to bundled agents. Seeded from defaults.ts
 * `agents:` table and reconciled with actual resolver output.
 *
 * KEY: All 18 agents resolve via their `tier:` declaration (Layer 5 of the
 * resolver). The resolver's Layer 6 `overrides:` for ultra-worker is NEVER
 * reached because the tier (Layer 5) resolves first. This is documented
 * and reconciled by ANV-0213 (see src/core/models/AGENTS.md for the 8-layer chain).
 *
 * ANV-0211: security-auditing moved from this registry to BUNDLED_SKILL_REGISTRY.
 * It is a skill (skills/universal/security-auditing.md), not an agent.
 * The defaults.ts agents table misclassifies it; that is a pre-existing bug
 * not corrected here (would change resolver behavior).
 *
 * Documented resolver behavior per agent:
 *   resolver tier=planning → best/high   (opus + high effort)
 *   resolver tier=review   → balanced/high  (sonnet + high effort)
 *   resolver tier=coding   → balanced/medium (sonnet + medium effort)
 *   resolver tier=quick    → cheap/undefined (haiku, effort clamped to none)
 *   resolver tier=ultra    → best/xhigh  (opus + xhigh effort)
 *   resolver tier=super    → best/max    (opus + max effort)
 *
 * Drift note — ultra-worker:
 *   defaults.ts has overrides['ultra-worker'] = { model: opus, effort: max, max_tokens: 32768 }
 *   But agents['ultra-worker'] = { tier: 'ultra' } (no model pin).
 *   Resolver hits tier layer first → opus/xhigh. Override (opus/max) is unreachable.
 *   Registry reflects resolver reality: opus/xhigh.
 *   The max_tokens=32768 override IS stored in the registry for future use,
 *   but the effort reflects what the resolver actually produces.
 *
 * Runtime-extensible via `registerAgentModel(name, entry)`.
 */

import type { ModelAssignment, RegistryEntry } from './model-registry-types.js'
import { tierToAssignment } from './model-registry-types.js'

// ─── Bundled registry (seeded from defaults.ts agents table) ─────────────────
export const BUNDLED_AGENT_REGISTRY: Readonly<Record<string, ModelAssignment>> =
  Object.freeze({
    // tier:planning → opus/high
    researcher: {
      ...tierToAssignment('planning'),
      model: 'opus',
      effort: 'high',
    },
    orchestrator: {
      ...tierToAssignment('planning'),
      model: 'opus',
      effort: 'high',
    },
    'code-architect': {
      ...tierToAssignment('planning'),
      model: 'opus',
      effort: 'high',
    },
    'framework-selector': {
      ...tierToAssignment('planning'),
      model: 'opus',
      effort: 'high',
    },
    'plan-verifier': {
      ...tierToAssignment('planning'),
      model: 'opus',
      effort: 'high',
    },
    'strict-reviewer': {
      ...tierToAssignment('planning'),
      model: 'opus',
      effort: 'high',
    },

    // tier:ultra → opus/xhigh
    // ANV-0213 reconciled: tier (Layer 5) fires before override (Layer 6) — this is the
    // correct and documented behavior per the 8-layer chain in src/core/models/AGENTS.md.
    //
    // defaults.ts overrides['ultra-worker'] = {model:opus, effort:max, max_tokens:32768}
    // is unreachable because the tier layer (Layer 5) resolves first.
    // max_tokens=32768 is preserved here for future wiring once ANV-0212 consults the registry.
    'ultra-worker': {
      ...tierToAssignment('ultra'),
      model: 'opus',
      effort: 'xhigh',
      max_tokens: 32768, // preserved from overrides block; not yet wired into resolver
    },
    'silent-failure-hunter': {
      ...tierToAssignment('ultra'),
      model: 'opus',
      effort: 'xhigh',
    },

    // tier:review → sonnet/high (review tier = balanced/high)
    'code-quality-reviewer': {
      ...tierToAssignment('review'),
      model: 'sonnet',
      effort: 'high',
    },
    'code-reviewer': {
      ...tierToAssignment('review'),
      model: 'sonnet',
      effort: 'high',
    },
    'code-simplifier': {
      ...tierToAssignment('review'),
      model: 'sonnet',
      effort: 'high',
    },
    'doc-verifier': {
      ...tierToAssignment('review'),
      model: 'sonnet',
      effort: 'high',
    },
    'spec-reviewer': {
      ...tierToAssignment('review'),
      model: 'sonnet',
      effort: 'high',
    },
    'test-analyzer': {
      ...tierToAssignment('review'),
      model: 'sonnet',
      effort: 'high',
    },

    // tier:coding → sonnet/medium
    'mcp-builder': {
      ...tierToAssignment('coding'),
      model: 'sonnet',
      effort: 'medium',
    },
    'subagent-executor': {
      ...tierToAssignment('coding'),
      model: 'sonnet',
      effort: 'medium',
    },
    'build-error-resolver': {
      ...tierToAssignment('coding'),
      model: 'sonnet',
      effort: 'medium',
    },

    // tier:quick → haiku (effort clamped to undefined for Haiku)
    'code-explorer': {
      ...tierToAssignment('quick'),
      model: 'haiku',
      // effort intentionally absent — Haiku drops effort (research §A1)
    },
  })

// ─── Runtime extension layer ─────────────────────────────────────────────────

const _extensionRegistry = new Map<string, RegistryEntry>()
const _userOverrides = new Map<string, RegistryEntry>()

/**
 * Register an agent model assignment at runtime.
 * Intended for use by extension install pipelines and tests.
 */
export function registerAgentModel(name: string, entry: RegistryEntry): void {
  _extensionRegistry.set(name, entry)
}

/**
 * Register multiple agent model assignments at once (batch extension registration).
 */
export function registerExtensionAgentAssignments(
  records: Record<string, RegistryEntry>,
): void {
  for (const [name, entry] of Object.entries(records)) {
    registerAgentModel(name, entry)
  }
}

/**
 * Apply user overrides from anvil.toml `agent_assignments:` block.
 * Called from src/core/config/load.ts when anvil.toml is parsed.
 */
export function setAgentUserOverrides(
  records: Record<string, RegistryEntry>,
): void {
  _userOverrides.clear()
  for (const [name, entry] of Object.entries(records)) {
    _userOverrides.set(name, entry)
  }
}

/**
 * Resolve an agent's ModelAssignment.
 * Precedence (highest first): user overrides → extensions → bundled.
 * Returns `undefined` if the agent is not registered anywhere.
 *
 * NOTE: Resolver wiring is ANV-0212's job.
 */
export function resolveAgentAssignment(
  name: string,
): ModelAssignment | undefined {
  return (
    _userOverrides.get(name) ??
    _extensionRegistry.get(name) ??
    BUNDLED_AGENT_REGISTRY[name]
  )
}

/**
 * Returns all registered agent names across all layers.
 */
export function allRegisteredAgentNames(): string[] {
  const names = new Set<string>([
    ...Object.keys(BUNDLED_AGENT_REGISTRY),
    ..._extensionRegistry.keys(),
    ..._userOverrides.keys(),
  ])
  return [...names]
}

/**
 * Reset runtime registrations (extensions + user overrides).
 * FOR TESTING ONLY.
 */
export function _resetAgentRegistryForTest(): void {
  _extensionRegistry.clear()
  _userOverrides.clear()
}
