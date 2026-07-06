import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { traceResolution } from '../../../../src/core/models/trace.js'

describe('core/models/trace', () => {
  const config = buildDefaultConfig()

  it('emits all 9 trace entries (8 layers + cli-tier sub-layer) in order', () => {
    // Layer 1=cli, 1b=cli-tier, 2=session, 3=env, 4=agent-override, 5=tier, 6=override, 7=group, 8=default
    const trace = traceResolution('planning', config)
    expect(trace.map((t) => t.layer)).toEqual([
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
  })

  it('marks the winning layer', () => {
    const trace = traceResolution('planning', config)
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('group')
    expect(winner?.resolvedModel).toBe('claude-opus-4-7')
  })

  it('marks tier as winner for ultra-worker (Plan 38 Phase C: agents.ultra-worker.tier=ultra)', () => {
    // Phase C adds agents['ultra-worker'] = { tier: 'ultra' } → resolves at tier layer
    // before the overrides layer is reached.
    const trace = traceResolution('ultra-worker', config)
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('tier')
  })

  it('falls back to default when no match', () => {
    const trace = traceResolution('random-unknown', config)
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('default')
  })

  it('returns cli as winner when cli override provided', () => {
    const trace = traceResolution('planning', config, {
      cli: { model: 'claude-haiku-4-5' },
    })
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('cli')
  })
})

// ─── Phase E: fallback_chain in trace entries ─────────────────────────────────

describe('core/models/trace — fallback_chain in entries', () => {
  const OPUS = 'claude-opus-4-6'
  const SONNET = 'claude-sonnet-4-6'
  const HAIKU = 'claude-haiku-4-5'

  function buildTraceConfig(opts: {
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
          note: 'custom',
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

  it('winning entry carries fallback_chain from the correct source layer', () => {
    const cfg = buildTraceConfig({
      defaultsChain: [SONNET, HAIKU],
      groupChain: [HAIKU],
    })
    const trace = traceResolution('planning', cfg)
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('group')
    // chain sourced from group (non-empty), not defaults
    expect(winner?.fallback_chain).toEqual([HAIKU])
    expect(winner?.fallback_chain_source).toBe('group')
  })

  it('fallback_chain_source differs from primary source when chain comes from a lower layer', () => {
    // primary from group, chain from defaults (group chain is empty)
    const cfg = buildTraceConfig({
      defaultsChain: [SONNET, HAIKU],
      groupChain: [],
    })
    const trace = traceResolution('planning', cfg)
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('group') // primary source
    expect(winner?.fallback_chain_source).toBe('default') // chain source differs
    expect(winner?.fallback_chain).toEqual([SONNET, HAIKU])
  })

  it('non-matching entries do not carry fallback_chain fields', () => {
    const cfg = buildTraceConfig({ defaultsChain: [SONNET, HAIKU] })
    const trace = traceResolution('planning', cfg)
    // cli entry didn't match (no CLI model provided) — should not have fallback_chain
    const cliEntry = trace.find((t) => t.layer === 'cli')
    expect(cliEntry?.match).toBe(false)
    expect(cliEntry?.fallback_chain).toBeUndefined()
  })

  it('cli-provided fallback_chain appears in cli winning entry', () => {
    const cfg = buildTraceConfig({ defaultsChain: [SONNET, HAIKU] })
    const trace = traceResolution('planning', cfg, {
      cli: { model: HAIKU, fallback_chain: [OPUS] },
    })
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('cli')
    expect(winner?.fallback_chain).toEqual([OPUS])
    expect(winner?.fallback_chain_source).toBe('cli')
  })

  it('default winning entry has correct fallback_chain when only defaults define chain', () => {
    const cfg = buildTraceConfig({ defaultsChain: [SONNET, HAIKU] })
    const trace = traceResolution('completely-unknown', cfg)
    const winner = trace.find((t) => t.match)
    expect(winner?.layer).toBe('default')
    expect(winner?.fallback_chain).toEqual([SONNET, HAIKU])
    expect(winner?.fallback_chain_source).toBe('default')
  })
})
