import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'
import type { ModelsConfig } from '../../../../src/core/types.js'

/**
 * ANV-0213 — Resolver-chain doc/code parity test.
 *
 * Exercises all 8 distinct source tags by constructing synthetic inputs that
 * force each layer to win. Asserts that the set of observed source tags matches
 * the documented 8-layer chain in src/core/models/AGENTS.md.
 *
 * If a new layer is added to resolve.ts, this test MUST be updated:
 *   1. Add a new synthetic case that exercises the new layer.
 *   2. Add the new source tag to DOCUMENTED_SOURCES.
 */

// ─── Documented layer set (must match AGENTS.md) ──────────────────────────────

const DOCUMENTED_SOURCES = new Set([
  'cli',
  'cli-tier',
  'session',
  'env',
  'agent-override',
  'tier',
  'override',
  'group',
  'default',
])

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a config with a direct model pin in config.agents[name].
 * This forces the agent-override layer (Layer 4) to win.
 */
function configWithAgentModelPin(name: string): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    agents: {
      ...base.agents,
      [name]: { model: 'sonnet' },
    },
  }
}

// ─── Layer exercises ──────────────────────────────────────────────────────────

describe('resolver chain doc/code parity', () => {
  const config = buildDefaultConfig()

  // Collect source tags from all 8 layer exercises
  const observedSources = new Set<string>()

  it('Layer 1 (cli): --model flag wins', () => {
    const r = resolveModel('unknown', config, {
      cli: { model: 'claude-opus-4-7' },
    })
    expect(r.source).toBe('cli')
    observedSources.add(r.source)
  })

  it('Layer 1b (cli-tier): --tier flag wins when --model absent', () => {
    // 'ultra' is a known tier in the default config
    const r = resolveModel('unknown', config, {
      cli: { tier: 'ultra' },
    })
    expect(r.source).toBe('cli-tier')
    observedSources.add(r.source)
  })

  it('Layer 2 (session): active-model.json wins over ENV', () => {
    const r = resolveModel('unknown', config, {
      session: {
        model: 'claude-haiku-4-5',
        set_at: '2026-01-01T00:00:00.000Z',
      },
      env: { ANVIL_MODEL: 'claude-opus-4-7' },
    })
    expect(r.source).toBe('session')
    observedSources.add(r.source)
  })

  it('Layer 3 (env): ANVIL_MODEL env var wins over config layers', () => {
    // 'brainstorming' is in planning group, but ENV overrides it
    const r = resolveModel('brainstorming', config, {
      env: { ANVIL_MODEL: 'claude-sonnet-4-6' },
    })
    expect(r.source).toBe('env')
    observedSources.add(r.source)
  })

  it('Layer 4 (agent-override): agents[name].model direct pin wins', () => {
    const cfg = configWithAgentModelPin('my-pinned-agent')
    const r = resolveModel('my-pinned-agent', cfg)
    expect(r.source).toBe('agent-override')
    observedSources.add(r.source)
  })

  it('Layer 5 (tier): agents[name].tier → tiers[tier].model wins', () => {
    // 'ultra-worker' has agents['ultra-worker'] = { tier: 'ultra' } (no model pin)
    // 'ultra-worker' is also in overrides AND autonomous group, but tier (Layer 5) fires first
    const r = resolveModel('ultra-worker', config)
    expect(r.source).toBe('tier')
    observedSources.add(r.source)
  })

  it('Layer 6 (override): ModelsConfig.overrides[name] wins over group', () => {
    // 'skill-selection' is in overrides AND planning group, but override (Layer 6) fires before group (Layer 7)
    // 'skill-selection' has no agents table entry (no agent-override or tier layers)
    const r = resolveModel('skill-selection', config)
    expect(r.source).toBe('override')
    observedSources.add(r.source)
  })

  it('Layer 7 (group): group membership wins over default', () => {
    // 'brainstorming' is in planning group, not in overrides or agents table
    const r = resolveModel('brainstorming', config)
    expect(r.source).toBe('group')
    observedSources.add(r.source)
  })

  it('Layer 8 (default): falls through to defaults for unknown entity', () => {
    const r = resolveModel('completely-unknown-skill-xyz', config)
    expect(r.source).toBe('default')
    observedSources.add(r.source)
  })

  it('observed source tags exactly match AGENTS.md documented layers', () => {
    // This assertion enforces doc/code parity: if a new layer is added to
    // resolve.ts, a new case must be added above AND DOCUMENTED_SOURCES updated.
    expect(observedSources).toEqual(DOCUMENTED_SOURCES)
  })
})
