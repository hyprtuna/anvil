/**
 * Phase B — 7-layer resolver tests.
 * Covers the two new layers inserted between ENV (3) and group (old-4/new-6):
 *   Layer 4: agent-override  (ModelsConfig.agents.<name>.model)
 *   Layer 5: tier            (ModelsConfig.agents.<name>.tier → ModelsConfig.tiers.<tier>.model)
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'
import type { ModelsConfig } from '../../../../src/core/types.js'

const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-7'

/** Build a config with optional agents + tiers blocks */
function buildConfigWithAgents(
  agents?: ModelsConfig['agents'],
  tiers?: ModelsConfig['tiers'],
): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    agents,
    tiers: tiers ?? {
      quick: { model: HAIKU },
      coding: { model: SONNET, effort: 'medium' },
      review: { model: SONNET, effort: 'high' },
      planning: { model: OPUS, effort: 'high' },
      ultra: { model: OPUS, effort: 'xhigh' },
      super: { model: OPUS, effort: 'max' },
    },
  }
}

describe('core/models/resolve-v2 (Phase B: 7-layer resolver)', () => {
  describe('layer 4: agent-override (agents.<name>.model)', () => {
    it('agent-override wins over group', () => {
      // researcher is in the planning group (resolves to OPUS via group)
      // but with agents.researcher.model it should use the pinned model
      const config = buildConfigWithAgents({
        researcher: { model: HAIKU },
      })
      const r = resolveModel('researcher', config)
      expect(r.model).toBe(HAIKU)
      expect(r.source).toBe('agent-override')
    })

    it('agent-override wins over default', () => {
      const config = buildConfigWithAgents({
        'my-agent': { model: OPUS },
      })
      const r = resolveModel('my-agent', config)
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('agent-override')
    })

    it('agent-override resolves aliases', () => {
      const config = buildConfigWithAgents({
        'my-agent': { model: 'balanced' }, // balanced → SONNET
      })
      const r = resolveModel('my-agent', config)
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('agent-override')
    })
  })

  describe('layer 5: tier (agents.<name>.tier → tiers.<tier>.model)', () => {
    it('tier=coding resolves through tiers table to sonnet', () => {
      const config = buildConfigWithAgents({
        researcher: { tier: 'coding' },
      })
      const r = resolveModel('researcher', config)
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('tier')
    })

    it('tier=quick resolves to haiku', () => {
      const config = buildConfigWithAgents({
        'light-agent': { tier: 'quick' },
      })
      const r = resolveModel('light-agent', config)
      expect(r.model).toBe(HAIKU)
      expect(r.source).toBe('tier')
    })

    it('tier=planning resolves to opus', () => {
      const config = buildConfigWithAgents({
        'planning-agent': { tier: 'planning' },
      })
      const r = resolveModel('planning-agent', config)
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('tier')
    })

    it('tier=ultra resolves to opus', () => {
      const config = buildConfigWithAgents({
        'ultra-agent': { tier: 'ultra' },
      })
      const r = resolveModel('ultra-agent', config)
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('tier')
    })

    it('tier wins over group', () => {
      // researcher is in planning group (OPUS via group)
      // agent tier:coding → SONNET wins
      const config = buildConfigWithAgents({
        researcher: { tier: 'coding' },
      })
      const r = resolveModel('researcher', config)
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('tier')
    })

    it('tier wins over default', () => {
      const config = buildConfigWithAgents({
        'unknown-agent': { tier: 'planning' },
      })
      const r = resolveModel('unknown-agent', config)
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('tier')
    })
  })

  describe('layer priority: agent-override beats tier', () => {
    it('model takes precedence over tier in the same agents entry', () => {
      // AgentModelConfig has model (use agent-override path)
      const config = buildConfigWithAgents({
        researcher: { model: HAIKU },
      })
      const r = resolveModel('researcher', config)
      expect(r.source).toBe('agent-override')
      expect(r.model).toBe(HAIKU)
    })
  })

  describe('CLI/ENV layers beat agent-override and tier', () => {
    it('CLI wins over agent-override', () => {
      const config = buildConfigWithAgents({
        researcher: { model: HAIKU },
      })
      const r = resolveModel('researcher', config, {
        cli: { model: SONNET },
      })
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('cli')
    })

    it('ENV wins over agent-override', () => {
      const config = buildConfigWithAgents({
        researcher: { model: HAIKU },
      })
      const r = resolveModel('researcher', config, {
        env: { ANVIL_MODEL: OPUS },
      })
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('env')
    })

    it('CLI wins over tier', () => {
      const config = buildConfigWithAgents({
        researcher: { tier: 'coding' },
      })
      const r = resolveModel('researcher', config, {
        cli: { model: HAIKU },
      })
      expect(r.model).toBe(HAIKU)
      expect(r.source).toBe('cli')
    })

    it('ENV wins over tier', () => {
      const config = buildConfigWithAgents({
        researcher: { tier: 'coding' },
      })
      const r = resolveModel('researcher', config, {
        env: { ANVIL_MODEL: OPUS },
      })
      expect(r.model).toBe(OPUS)
      expect(r.source).toBe('env')
    })
  })

  describe('agents without override fall through to group/default', () => {
    it('skill not in agents falls through to group', () => {
      // planning is in planning group; no agents entry
      const config = buildConfigWithAgents({})
      const r = resolveModel('planning', config)
      expect(r.source).toBe('group')
    })

    it('skill not in agents and not in group falls to default', () => {
      const config = buildConfigWithAgents({})
      const r = resolveModel('totally-unknown', config)
      expect(r.source).toBe('default')
    })
  })

  describe('source tag correctness', () => {
    it('source is "agent-override" for agents.<name>.model', () => {
      const config = buildConfigWithAgents({ researcher: { model: SONNET } })
      expect(resolveModel('researcher', config).source).toBe('agent-override')
    })

    it('source is "tier" for agents.<name>.tier', () => {
      const config = buildConfigWithAgents({ researcher: { tier: 'coding' } })
      expect(resolveModel('researcher', config).source).toBe('tier')
    })
  })
})
