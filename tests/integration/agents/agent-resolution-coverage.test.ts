/**
 * Plan 38 Phase E — Agent resolution coverage test.
 *
 * For each of the 17 shipped agents (Phase E sweep minus ANV-0083 collapsed
 * pair), calls resolveModel(agentName, buildDefaultConfig()) and asserts the
 * resolved {model, effort} matches the migration-table prediction.
 *
 * This test validates the full chain:
 *   defaults.agents[name].tier → defaults.tiers[tier].{model,effort} → resolveAlias → concrete model id
 *
 * Source-tag must be 'tier' for all 19 agents (agent-override wins over group/default).
 * Exception: code-explorer resolves to haiku with effort clamped to undefined (Haiku
 * does not accept effort — research §A1).
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { resolveModel } from '../../../src/core/models/resolve.js'

/**
 * Per-agent expected resolution after the Phase E tier migration.
 * Maps agent name to { model, effort } from the migration table.
 *
 * quick tier:    claude-haiku-4-5, effort: undefined (clamped — Haiku rejects effort)
 * coding tier:   claude-sonnet-4-6, effort: medium
 * review tier:   claude-sonnet-4-6, effort: high
 * planning tier: claude-opus-4-7,   effort: high
 * ultra tier:    claude-opus-4-7,   effort: xhigh
 * super tier:    claude-opus-4-7,   effort: max
 */
const EXPECTED: ReadonlyArray<{
  name: string
  tier: string
  model: string
  effort: string | undefined
}> = [
  {
    name: 'code-architect',
    tier: 'planning',
    model: 'claude-opus-4-7',
    effort: 'high',
  },
  {
    name: 'code-explorer',
    tier: 'quick',
    model: 'claude-haiku-4-5',
    effort: undefined, // Haiku clamped — no effort sent
  },
  {
    name: 'code-quality-reviewer',
    tier: 'review',
    model: 'claude-sonnet-4-6',
    effort: 'high',
  },
  {
    name: 'code-reviewer',
    tier: 'review',
    model: 'claude-sonnet-4-6',
    effort: 'high',
  },
  {
    name: 'code-simplifier',
    tier: 'review',
    model: 'claude-sonnet-4-6',
    effort: 'high',
  },
  {
    name: 'doc-verifier',
    tier: 'review',
    model: 'claude-sonnet-4-6',
    effort: 'high',
  },
  {
    name: 'framework-selector',
    tier: 'planning',
    model: 'claude-opus-4-7',
    effort: 'high',
  },
  {
    name: 'mcp-builder',
    tier: 'coding',
    model: 'claude-sonnet-4-6',
    effort: 'medium',
  },
  {
    name: 'orchestrator',
    tier: 'planning',
    model: 'claude-opus-4-7',
    effort: 'high',
  },
  {
    name: 'plan-verifier',
    tier: 'planning',
    model: 'claude-opus-4-7',
    effort: 'high',
  },
  {
    name: 'researcher',
    tier: 'planning',
    model: 'claude-opus-4-7',
    effort: 'high',
  },
  // ANV-0083: retroactive-validator collapsed into sibling prompt.
  {
    name: 'silent-failure-hunter',
    tier: 'ultra',
    model: 'claude-opus-4-7',
    effort: 'xhigh',
  },
  {
    name: 'spec-reviewer',
    tier: 'review',
    model: 'claude-sonnet-4-6',
    effort: 'high',
  },
  {
    name: 'strict-reviewer',
    tier: 'planning',
    model: 'claude-opus-4-7',
    effort: 'high',
  },
  {
    name: 'subagent-executor',
    tier: 'coding',
    model: 'claude-sonnet-4-6',
    effort: 'medium',
  },
  {
    name: 'test-analyzer',
    tier: 'review',
    model: 'claude-sonnet-4-6',
    effort: 'high',
  },
  // ANV-0083: type-design-analyzer collapsed into sibling prompt.
  {
    name: 'ultra-worker',
    tier: 'ultra',
    model: 'claude-opus-4-7',
    effort: 'xhigh',
  },
] as const

describe('Phase E / agent resolution coverage (17 agents)', () => {
  const config = buildDefaultConfig()

  it('config.agents block contains all 17 agents (Phase E 19 minus collapsed 2)', () => {
    const agentNames = EXPECTED.map((e) => e.name)
    for (const name of agentNames) {
      expect(
        config.agents?.[name],
        `config.agents must contain entry for '${name}'`,
      ).toBeDefined()
    }
  })

  for (const { name, tier, model, effort } of EXPECTED) {
    describe(`agent: ${name} (tier: ${tier})`, () => {
      it(`resolves to model ${model}`, () => {
        const resolution = resolveModel(name, config)
        expect(resolution.model).toBe(model)
      })

      it(`resolves to effort ${String(effort)}`, () => {
        const resolution = resolveModel(name, config)
        expect(resolution.effort).toBe(effort)
      })

      it('resolution source is tier (not group or default)', () => {
        const resolution = resolveModel(name, config)
        expect(
          resolution.source,
          `${name} should resolve via 'tier' source, got '${resolution.source}'`,
        ).toBe('tier')
      })
    })
  }
})
