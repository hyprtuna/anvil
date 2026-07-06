import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { resolveAlias } from '../../src/core/models/aliases.js'
import { resolveModel } from '../../src/core/models/resolve.js'
import {
  BUNDLED_AGENT_REGISTRY,
  BUNDLED_SKILL_REGISTRY,
} from '../../src/core/registry/model-registry-index.js'

const config = buildDefaultConfig()

function snapshot(name: string) {
  const r = resolveModel(name, config, {})
  return {
    model: r.model,
    effort: r.effort,
    source: r.source,
    max_tokens: r.max_tokens,
  }
}

// ─── Key skill spot-checks (formerly the original 6 skill tests) ─────────────

describe('resolver output — key skill spot-checks ( drift reconciliations)', () => {
  it('plan-writing resolves via planning group (opus/high)', () => {
    expect(snapshot('plan-writing')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'high',
      source: 'group',
    })
  })

  it('brainstorm-spec resolves via planning group after reconciliation (opus/high)', () => {
    // Previously fell to default (sonnet/medium). Now in planning group.
    expect(snapshot('brainstorm-spec')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'high',
      source: 'group',
    })
  })

  it('code-review resolves via review group after reconciliation (opus/high)', () => {
    // Previously fell to default (sonnet/medium). Now in review group.
    expect(snapshot('code-review')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'high',
      source: 'group',
    })
  })

  it('plan-verification resolves via review group after reconciliation (opus/high)', () => {
    // Previously fell to default (sonnet/medium). Now in review group.
    expect(snapshot('plan-verification')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'high',
      source: 'group',
    })
  })

  it('using-anvil resolves via meta group after reconciliation (sonnet/medium)', () => {
    // Previously fell to default. Now in meta group.
    expect(snapshot('using-anvil')).toMatchObject({
      model: 'claude-sonnet-4-6',
      effort: 'medium',
      source: 'group',
    })
  })

  it('default-feature resolves via workflow group after reconciliation (sonnet/high)', () => {
    // Previously fell to default (sonnet/medium). Now in workflow group (sonnet/high).
    expect(snapshot('default-feature')).toMatchObject({
      model: 'claude-sonnet-4-6',
      effort: 'high',
      source: 'group',
    })
  })
})

// ─── Full skill registry coverage ────────────────────────────────────────────

describe('resolver output — all BUNDLED_SKILL_REGISTRY entries', () => {
  it('every skill registry entry matches resolver output for model', () => {
    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      if (!entry.model) continue
      const resolved = resolveModel(name, config, {})
      const registryModel = resolveAlias(entry.model, config.model_aliases)
      expect(
        registryModel,
        `${name}: registry model "${entry.model}" (→${registryModel}) must match resolver "${resolved.model}"`,
      ).toBe(resolved.model)
    }
  })

  it('every skill registry entry matches resolver output for effort', () => {
    for (const [name, entry] of Object.entries(BUNDLED_SKILL_REGISTRY)) {
      if (!entry.effort) continue
      const resolved = resolveModel(name, config, {})
      expect(
        entry.effort,
        `${name}: registry effort "${entry.effort}" must match resolver "${resolved.effort}"`,
      ).toBe(resolved.effort)
    }
  })

  it('registry covers at least 80 skills (full-surface coverage sanity check)', () => {
    expect(Object.keys(BUNDLED_SKILL_REGISTRY).length).toBeGreaterThanOrEqual(
      80,
    )
  })
})

// ─── Full agent registry coverage ────────────────────────────────────────────

describe('resolver output — all BUNDLED_AGENT_REGISTRY entries', () => {
  it('ultra-worker resolves via tier:ultra (opus/xhigh — override unreachable)', () => {
    // tier layer fires before override layer.
    // overrides['ultra-worker'] = { model: opus, effort: max, max_tokens: 32768 } is unreachable.
    expect(snapshot('ultra-worker')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'xhigh',
      source: 'tier',
    })
  })

  it('orchestrator resolves via tier:planning (opus/high)', () => {
    expect(snapshot('orchestrator')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'high',
      source: 'tier',
    })
  })

  it('code-explorer resolves via tier:quick (haiku, effort clamped to undefined)', () => {
    const r = resolveModel('code-explorer', config, {})
    expect(r.model).toBe('claude-haiku-4-5')
    expect(r.source).toBe('tier')
    expect(r.effort).toBeUndefined()
  })

  it('code-reviewer resolves via tier:review (sonnet/high)', () => {
    expect(snapshot('code-reviewer')).toMatchObject({
      model: 'claude-sonnet-4-6',
      effort: 'high',
      source: 'tier',
    })
  })

  it('code-quality-reviewer resolves via tier:review (sonnet/high)', () => {
    expect(snapshot('code-quality-reviewer')).toMatchObject({
      model: 'claude-sonnet-4-6',
      effort: 'high',
      source: 'tier',
    })
  })

  it('mcp-builder resolves via tier:coding (sonnet/medium)', () => {
    expect(snapshot('mcp-builder')).toMatchObject({
      model: 'claude-sonnet-4-6',
      effort: 'medium',
      source: 'tier',
    })
  })

  it('silent-failure-hunter resolves via tier:ultra (opus/xhigh)', () => {
    expect(snapshot('silent-failure-hunter')).toMatchObject({
      model: 'claude-opus-4-7',
      effort: 'xhigh',
      source: 'tier',
    })
  })

  it('every agent registry entry matches resolver output for model', () => {
    for (const [name, entry] of Object.entries(BUNDLED_AGENT_REGISTRY)) {
      if (!entry.model) continue
      const resolved = resolveModel(name, config, {})
      const registryModel = resolveAlias(entry.model, config.model_aliases)
      expect(
        registryModel,
        `${name}: registry model "${entry.model}" (→${registryModel}) must match resolver "${resolved.model}"`,
      ).toBe(resolved.model)
    }
  })

  it('every agent registry entry matches resolver output for effort', () => {
    for (const [name, entry] of Object.entries(BUNDLED_AGENT_REGISTRY)) {
      if (!entry.effort) continue
      const resolved = resolveModel(name, config, {})
      expect(
        entry.effort,
        `${name}: registry effort "${entry.effort}" must match resolver "${resolved.effort}"`,
      ).toBe(resolved.effort)
    }
  })

  it('registry covers 18 agents (security-auditing moved to skill registry in)', () => {
    // 19 agents in defaults.ts agents table; security-auditing moved to skill registry.
    expect(Object.keys(BUNDLED_AGENT_REGISTRY).length).toBe(18)
  })
})

// ─── ANV-0212 gate: registry not yet wired ────────────────────────────────────

describe('registry is NOT yet wired into the resolver ( gate)', () => {
  it('resolveModel source for code-review is group (not registry) — drift reconciled', () => {
    // code-review was 'default' before ANV-0211 added it to review group.
    const result = resolveModel('code-review', config, {})
    expect(result.source).not.toBe('registry')
    expect(result.source).toBe('group')
  })

  it('resolveModel source for ultra-worker is tier, not registry', () => {
    const result = resolveModel('ultra-worker', config, {})
    expect(result.source).not.toBe('registry')
    expect(result.source).toBe('tier')
  })

  it('resolveModel source for plan-writing is group, not registry', () => {
    const result = resolveModel('plan-writing', config, {})
    expect(result.source).not.toBe('registry')
    expect(result.source).toBe('group')
  })
})
