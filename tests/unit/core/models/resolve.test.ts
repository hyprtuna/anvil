import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'

describe('core/models/resolve', () => {
  const config = buildDefaultConfig()

  describe('layer 5: defaults', () => {
    it('returns defaults for unknown skills', () => {
      const r = resolveModel('unknown-skill', config)
      expect(r.model).toBe('claude-sonnet-4-6')
      expect(r.effort).toBe('medium')
      expect(r.source).toBe('default')
    })
  })

  describe('layer 4: group membership', () => {
    it('resolves planning skills to the planning group', () => {
      const r = resolveModel('planning', config)
      expect(r.model).toBe('claude-opus-4-7')
      expect(r.effort).toBe('high')
      expect(r.source).toBe('group')
    })
    it('resolves automation skills to the automation group', () => {
      const r = resolveModel('git-workflow', config)
      expect(r.model).toBe('claude-haiku-4-5')
      // Plan 38 Phase A: Haiku does not accept effort; effort is clamped to undefined
      expect(r.effort).toBeUndefined()
      expect(r.source).toBe('group')
    })
  })

  describe('layer 3: per-skill override', () => {
    it('resolves ultra-worker via tier (Plan 38 Phase C: agents.ultra-worker.tier=ultra supersedes overrides layer)', () => {
      // Phase C adds agents['ultra-worker'] = { tier: 'ultra' } → resolves at layer 5 (tier)
      // before the overrides layer (layer 6) is checked. The 'ultra' tier resolves to
      // {model: claude-opus-4-7, effort: xhigh}. max_tokens comes from defaults (8192).
      const r = resolveModel('ultra-worker', config)
      expect(r.model).toBe('claude-opus-4-7')
      expect(r.effort).toBe('xhigh')
      expect(r.max_tokens).toBe(8192)
      expect(r.source).toBe('tier')
    })
    it('overrides group for skill-selection', () => {
      const r = resolveModel('skill-selection', config)
      expect(r.model).toBe('claude-haiku-4-5')
      // Plan 38 Phase A: Haiku does not accept effort; effort is clamped to undefined
      expect(r.effort).toBeUndefined()
      expect(r.source).toBe('override')
    })
  })

  describe('layer 2: ENV vars', () => {
    it('resolves from ANVIL_MODEL', () => {
      const r = resolveModel('planning', config, {
        env: { ANVIL_MODEL: 'claude-sonnet-4-6' },
      })
      expect(r.model).toBe('claude-sonnet-4-6')
      expect(r.source).toBe('env')
    })
    it('resolves effort from ANVIL_EFFORT', () => {
      // Use claude-opus-4-7 (known in BUILTIN_SUPPORTED_EFFORTS); -4-6 is unknown → effort would clamp to undefined
      const r = resolveModel('planning', config, {
        env: { ANVIL_MODEL: 'claude-opus-4-7', ANVIL_EFFORT: 'max' },
      })
      expect(r.effort).toBe('max')
    })
    it('throws on invalid ANVIL_EFFORT', () => {
      expect(() =>
        resolveModel('planning', config, {
          env: { ANVIL_MODEL: 'claude-opus-4-6', ANVIL_EFFORT: 'banana' },
        }),
      ).toThrow(/Invalid ANVIL_EFFORT/)
    })
  })

  describe('layer 1: CLI overrides', () => {
    it('wins over all other layers', () => {
      const r = resolveModel('ultra-worker', config, {
        cli: { model: 'claude-haiku-4-5', effort: 'low' },
      })
      expect(r.model).toBe('claude-haiku-4-5')
      // Plan 38 Phase A: Haiku does not accept effort; effort is clamped to undefined
      expect(r.effort).toBeUndefined()
      expect(r.source).toBe('cli')
    })
  })

  describe('precedence', () => {
    it('CLI > ENV > override > group > default', () => {
      const baseline = resolveModel('planning', config)
      expect(baseline.source).toBe('group')
      const withEnv = resolveModel('planning', config, {
        env: { ANVIL_MODEL: 'claude-sonnet-4-6' },
      })
      expect(withEnv.source).toBe('env')
      const withCli = resolveModel('planning', config, {
        env: { ANVIL_MODEL: 'claude-sonnet-4-6' },
        cli: { model: 'claude-haiku-4-5' },
      })
      expect(withCli.source).toBe('cli')
    })
  })

  describe('fallback_chain propagation', () => {
    it('propagates fallback_chain from defaults', () => {
      const r = resolveModel('unknown-skill', config)
      expect(r.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })

    it('propagates fallback_chain through group resolution', () => {
      const r = resolveModel('planning', config)
      expect(r.source).toBe('group')
      expect(r.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })

    it('propagates fallback_chain through tier resolution (Plan 38 Phase C: ultra-worker resolves via tier)', () => {
      // Phase C: ultra-worker is now in agents block with tier:ultra → resolves at layer 5 (tier).
      // fallback_chain still comes from defaults (overrides layer not reached).
      const r = resolveModel('ultra-worker', config)
      expect(r.source).toBe('tier')
      expect(r.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })

    it('propagates fallback_chain through env resolution', () => {
      const r = resolveModel('planning', config, {
        env: { ANVIL_MODEL: 'claude-sonnet-4-6' },
      })
      expect(r.source).toBe('env')
      expect(r.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })

    it('propagates fallback_chain through cli resolution', () => {
      const r = resolveModel('planning', config, {
        cli: { model: 'claude-haiku-4-5' },
      })
      expect(r.source).toBe('cli')
      expect(r.fallback_chain).toEqual([
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ])
    })
  })

  describe('override max_tokens', () => {
    it('override max_tokens takes precedence over defaults when tier layer does not fire', () => {
      // Plan 38 Phase C: ultra-worker is now in agents block with tier:ultra, so it resolves
      // via tier (layer 5) not override (layer 6). Use skill-selection which is in overrides
      // but NOT in agents — so its overrides entry is still reachable.
      const r = resolveModel('skill-selection', config)
      // skill-selection override has no max_tokens field → falls back to defaults
      expect(r.max_tokens).toBe(8192)
      // Default max_tokens is 8192
      expect(config.defaults.max_tokens).toBe(8192)
    })

    it('skill without override gets default max_tokens', () => {
      const r = resolveModel('planning', config)
      expect(r.max_tokens).toBe(8192)
    })
  })

  describe('skills not in any group', () => {
    it('skill not in any group falls back to defaults', () => {
      const r = resolveModel('completely-unknown-skill', config)
      expect(r.model).toBe('claude-sonnet-4-6')
      expect(r.effort).toBe('medium')
      expect(r.max_tokens).toBe(8192)
      expect(r.source).toBe('default')
    })

    it('fallback_model comes from defaults', () => {
      const r = resolveModel('completely-unknown-skill', config)
      expect(r.fallback_model).toBe('claude-haiku-4-5')
    })
  })
})

// ─── Phase E: fallback_chain cascade (highest non-empty layer wins) ──────────

describe('fallback_chain cascade resolution', () => {
  const OPUS = 'claude-opus-4-6'
  const SONNET = 'claude-sonnet-4-6'
  const HAIKU = 'claude-haiku-4-5'

  /**
   * Build a minimal config that exercises fallback_chain at every layer.
   * Groups and overrides intentionally carry their own chains so we can
   * assert which layer wins under various configurations.
   */
  function buildCascadeConfig(opts: {
    defaultsChain?: string[]
    groupChain?: string[]
    overrideChain?: string[]
  }) {
    return {
      $schema: 'https://anvil.dev/schemas/models.json',
      version: '1.0',
      defaults: {
        model: SONNET,
        effort: 'medium' as const,
        fallback_model: HAIKU,
        fallback_chain: opts.defaultsChain ?? [],
        max_tokens: 8192,
      },
      groups: {
        planning: {
          model: OPUS,
          effort: 'high' as const,
          fallback_chain: opts.groupChain ?? [],
          description: 'Planning group',
          members: ['planning'],
        },
      },
      overrides: {
        'custom-skill': {
          model: OPUS,
          effort: 'high' as const,
          fallback_chain: opts.overrideChain ?? [],
          note: 'custom skill override',
        },
      },
      effort_levels: {
        low: { description: '' },
        medium: { description: '' },
        high: { description: '' },
        xhigh: { description: '' },
        max: { description: '' },
      },
      model_aliases: {
        fast: HAIKU,
        balanced: SONNET,
        powerful: OPUS,
        default: SONNET,
      },
      disabled: { skills: [], hooks: [], agents: [] },
    }
  }

  describe('cascade defined only at defaults', () => {
    it('uses defaults chain for every skill', () => {
      const cfg = buildCascadeConfig({ defaultsChain: [SONNET, HAIKU] })
      const r1 = resolveModel('completely-unknown', cfg)
      expect(r1.fallback_chain).toEqual([SONNET, HAIKU])
      expect(r1.fallback_chain_source).toBe('default')

      const r2 = resolveModel('planning', cfg)
      expect(r2.source).toBe('group')
      expect(r2.fallback_chain).toEqual([SONNET, HAIKU])
      expect(r2.fallback_chain_source).toBe('default')
    })
  })

  describe('cascade defined at group layer', () => {
    it('group chain wins over defaults chain for members', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [HAIKU],
      })
      const r = resolveModel('planning', cfg)
      expect(r.source).toBe('group')
      expect(r.fallback_chain).toEqual([HAIKU])
      expect(r.fallback_chain_source).toBe('group')
    })

    it('non-member still uses defaults chain', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [HAIKU],
      })
      const r = resolveModel('completely-unknown', cfg)
      expect(r.fallback_chain).toEqual([SONNET, HAIKU])
      expect(r.fallback_chain_source).toBe('default')
    })
  })

  describe('cascade defined at override layer', () => {
    it('override chain wins over group and defaults for that specific skill', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [HAIKU],
        overrideChain: [OPUS],
      })
      const r = resolveModel('custom-skill', cfg)
      expect(r.source).toBe('override')
      expect(r.fallback_chain).toEqual([OPUS])
      expect(r.fallback_chain_source).toBe('override')
    })

    it('skill not using override still falls through to group/default', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [HAIKU],
        overrideChain: [OPUS],
      })
      const r = resolveModel('planning', cfg)
      // planning is in group, not overridden; group chain wins over defaults
      expect(r.fallback_chain).toEqual([HAIKU])
      expect(r.fallback_chain_source).toBe('group')
    })
  })

  describe('highest non-empty layer wins (empty chain defers to next)', () => {
    it('empty group chain defers to defaults chain', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [], // empty — should defer
      })
      const r = resolveModel('planning', cfg)
      expect(r.fallback_chain).toEqual([SONNET, HAIKU])
      expect(r.fallback_chain_source).toBe('default')
    })

    it('empty override chain defers to group chain', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [HAIKU],
        overrideChain: [], // empty — should defer
      })
      // custom-skill is in overrides but chain is empty, so group chain should win;
      // however custom-skill is not in planning group, so defaults chain wins
      const r = resolveModel('custom-skill', cfg)
      expect(r.source).toBe('override') // primary model still from override
      expect(r.fallback_chain).toEqual([SONNET, HAIKU])
      expect(r.fallback_chain_source).toBe('default')
    })

    it('empty override and empty group chain both defer to defaults', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [],
        overrideChain: [],
      })
      const r = resolveModel('planning', cfg)
      expect(r.fallback_chain).toEqual([SONNET, HAIKU])
      expect(r.fallback_chain_source).toBe('default')
    })

    it('all chains empty produces empty fallback_chain', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [],
        groupChain: [],
        overrideChain: [],
      })
      const r = resolveModel('planning', cfg)
      expect(r.fallback_chain).toEqual([])
      expect(r.fallback_chain_source).toBeUndefined()
    })
  })

  describe('alias resolution in fallback_chain', () => {
    it('resolves aliases in chain entries through aliases.ts', () => {
      // The model_aliases map: fast→haiku, balanced→sonnet, powerful→opus
      const cfg = buildCascadeConfig({
        defaultsChain: ['fast', 'balanced'],
      })
      const r = resolveModel('completely-unknown', cfg)
      // aliases must be resolved to concrete IDs
      expect(r.fallback_chain).toEqual([HAIKU, SONNET])
      expect(r.fallback_chain_source).toBe('default')
    })

    it('resolves aliases in group-level chain', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET],
        groupChain: ['powerful', 'balanced'],
      })
      const r = resolveModel('planning', cfg)
      expect(r.fallback_chain).toEqual([OPUS, SONNET])
      expect(r.fallback_chain_source).toBe('group')
    })

    it('resolves aliases in override-level chain', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET],
        overrideChain: ['fast'],
      })
      const r = resolveModel('custom-skill', cfg)
      expect(r.fallback_chain).toEqual([HAIKU])
      expect(r.fallback_chain_source).toBe('override')
    })
  })

  describe('fallback_chain_source is distinct from primary source', () => {
    it('primary source and fallback_chain_source can differ', () => {
      // primary model resolved from group; chain from defaults (group chain is empty)
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [],
      })
      const r = resolveModel('planning', cfg)
      expect(r.source).toBe('group')
      expect(r.fallback_chain_source).toBe('default')
    })

    it('primary source and fallback_chain_source match when same layer provides both', () => {
      const cfg = buildCascadeConfig({
        defaultsChain: [SONNET, HAIKU],
        groupChain: [HAIKU],
      })
      const r = resolveModel('planning', cfg)
      expect(r.source).toBe('group')
      expect(r.fallback_chain_source).toBe('group')
    })
  })
})
