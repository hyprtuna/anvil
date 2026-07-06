/**
 * Phase B — Agent frontmatter resolution tests.
 * Covers requires_any_model gate logic in the resolver.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'
import type { ModelsConfig } from '../../../../src/core/types.js'

const HAIKU = 'claude-haiku-4-5'
const SONNET = 'claude-sonnet-4-6'
const OPUS = 'claude-opus-4-7'

/**
 * Build a config that pins an agent to a specific model via agents.<name>.model.
 * The `requires_any_model` gate is passed via resolveModel opts, not config.
 */
function buildConfigWithAgentModel(
  agentName: string,
  availableModel: string,
): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    agents: {
      [agentName]: { model: availableModel },
    },
    tiers: {
      quick: { model: HAIKU, effort: 'medium' },
      standard: { model: SONNET, effort: 'medium' },
      deep: { model: OPUS, effort: 'high' },
    },
  }
}

describe('core/models/agent-frontmatter-resolution (Phase B)', () => {
  describe('requires_any_model gate', () => {
    it('resolves cleanly when resolved model is in requires_any_model list', () => {
      const config = buildConfigWithAgentModel('gated-agent', SONNET)
      // The resolver should succeed — SONNET is in [OPUS, SONNET]
      const r = resolveModel('gated-agent', config, {
        requires_any_model: [OPUS, SONNET],
      })
      expect(r.model).toBe(SONNET)
      expect(r.source).toBe('agent-override')
    })

    it('throws a gate error when resolved model is not in requires_any_model list', () => {
      const config = buildConfigWithAgentModel('gated-agent', HAIKU)
      // HAIKU is NOT in [OPUS, SONNET]
      expect(() =>
        resolveModel('gated-agent', config, {
          requires_any_model: [OPUS, SONNET],
        }),
      ).toThrow(/requires_any_model/)
    })

    it('gate error includes model name and allowed list for diagnostics', () => {
      const config = buildConfigWithAgentModel('gated-agent', HAIKU)
      let errorMsg = ''
      try {
        resolveModel('gated-agent', config, {
          requires_any_model: [OPUS],
        })
      } catch (e) {
        errorMsg = (e as Error).message
      }
      expect(errorMsg).toContain(HAIKU)
      expect(errorMsg).toContain(OPUS)
    })

    it('no gate check when requires_any_model is absent from opts', () => {
      // Default behavior — no gate; should always resolve
      const config = buildDefaultConfig()
      const r = resolveModel('planning', config)
      expect(r.model).toBeTruthy()
    })

    it('gate check with empty requires_any_model passes (no restriction)', () => {
      const config = buildConfigWithAgentModel('gated-agent', HAIKU)
      // empty list means no restriction
      const r = resolveModel('gated-agent', config, {
        requires_any_model: [],
      })
      expect(r.model).toBe(HAIKU)
    })
  })
})
