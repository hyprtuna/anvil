/**
 * Tests for ANV-0049 — SystemDirective typed vocabulary.
 *
 * Covers:
 *   - createSystemDirective: wraps body with type tag
 *   - parseSystemDirective: round-trips tag → type + body
 *   - dedupeDirectives: last-wins per type, preserves order, handles untagged
 *   - dispatcher integration: two handlers same type → one merged output
 */

import { describe, expect, it } from 'vitest'
import {
  createSystemDirective,
  dedupeDirectives,
  parseSystemDirective,
} from '../../../src/hooks/system-directive.js'

describe('createSystemDirective', () => {
  it('tags the body with the directive type prefix', () => {
    const result = createSystemDirective('ROUTING_HINT', 'Use Skill foo')
    expect(result).toBe('[DIRECTIVE:ROUTING_HINT]\nUse Skill foo')
  })

  it('tags BOOTSTRAP directives correctly', () => {
    const result = createSystemDirective('BOOTSTRAP', 'session context here')
    expect(result).toMatch(/^\[DIRECTIVE:BOOTSTRAP\]\n/)
    expect(result).toContain('session context here')
  })

  it('preserves multi-line body content', () => {
    const body = 'line one\nline two\nline three'
    const result = createSystemDirective('ADVISORY', body)
    expect(result).toBe(`[DIRECTIVE:ADVISORY]\n${body}`)
  })
})

describe('parseSystemDirective', () => {
  it('round-trips a tagged directive back to type + body', () => {
    const raw = createSystemDirective(
      'CONTEXT_WINDOW_MONITOR',
      'Context at 75%',
    )
    const { type, body } = parseSystemDirective(raw)
    expect(type).toBe('CONTEXT_WINDOW_MONITOR')
    expect(body).toBe('Context at 75%')
  })

  it('returns null type for untagged strings', () => {
    const { type, body } = parseSystemDirective('plain string, no tag')
    expect(type).toBeNull()
    expect(body).toBe('plain string, no tag')
  })

  it('returns null type for strings with unknown type tags (body is stripped of tag)', () => {
    const { type, body } = parseSystemDirective(
      '[DIRECTIVE:UNKNOWN_TYPE]\nbody',
    )
    expect(type).toBeNull()
    // Tag is parsed out; body is the content after the tag line.
    expect(body).toBe('body')
  })

  it('handles all known SystemDirectiveTypes', () => {
    const types = [
      'BOOTSTRAP',
      'ROUTING_HINT',
      'CONTEXT_WINDOW_MONITOR',
      'SKILL_REINFORCEMENT',
      'ADVISORY',
      'DOCTOR_FINDING',
    ] as const
    for (const t of types) {
      const raw = createSystemDirective(t, `body for ${t}`)
      const parsed = parseSystemDirective(raw)
      expect(parsed.type).toBe(t)
      expect(parsed.body).toBe(`body for ${t}`)
    }
  })
})

describe('dedupeDirectives', () => {
  it('returns undefined for empty array', () => {
    expect(dedupeDirectives([])).toBeUndefined()
  })

  it('passes a single untagged string through unchanged', () => {
    expect(dedupeDirectives(['plain string'])).toBe('plain string')
  })

  it('returns the body of a single typed directive (without the tag)', () => {
    const raw = createSystemDirective('ROUTING_HINT', 'Use skill foo')
    expect(dedupeDirectives([raw])).toBe('Use skill foo')
  })

  it('two directives of the same type → last-wins (AC: dedupe)', () => {
    const first = createSystemDirective('ROUTING_HINT', 'Use skill alpha')
    const second = createSystemDirective('ROUTING_HINT', 'Use skill beta')
    const result = dedupeDirectives([first, second])
    // Only beta should survive
    expect(result).toBe('Use skill beta')
    expect(result).not.toContain('alpha')
  })

  it('ordering: AC verifies typed directives appear in first-seen-type order', () => {
    const routing = createSystemDirective('ROUTING_HINT', 'routing body')
    const bootstrap = createSystemDirective('BOOTSTRAP', 'bootstrap body')
    const routingAgain = createSystemDirective('ROUTING_HINT', 'routing body 2')
    const result = dedupeDirectives([routing, bootstrap, routingAgain])
    // ROUTING_HINT first (first-seen), then BOOTSTRAP; routing deduplicated to last value
    const parts = result!.split('\n\n')
    expect(parts[0]).toBe('routing body 2')
    expect(parts[1]).toBe('bootstrap body')
  })

  it('different typed directives are both preserved', () => {
    const a = createSystemDirective('BOOTSTRAP', 'bootstrap info')
    const b = createSystemDirective('CONTEXT_WINDOW_MONITOR', '75% used')
    const result = dedupeDirectives([a, b])
    expect(result).toContain('bootstrap info')
    expect(result).toContain('75% used')
  })

  it('untagged strings are deduped by identity', () => {
    const result = dedupeDirectives(['raw text', 'raw text', 'other'])
    // 'raw text' appears only once
    expect(result?.split('raw text').length).toBe(2)
    expect(result).toContain('other')
  })

  it('typed directives appear before untagged strings in output', () => {
    const untagged = 'legacy untagged string'
    const typed = createSystemDirective('ADVISORY', 'advisory body')
    const result = dedupeDirectives([untagged, typed])
    // typed comes first in output (typed section, then untagged section)
    const idx_advisory = result!.indexOf('advisory body')
    const idx_untagged = result!.indexOf(untagged)
    expect(idx_advisory).toBeLessThan(idx_untagged)
  })
})

describe('dispatcher integration — dedupe via DispatchResult.systemInsert', () => {
  it('two handlers emitting same-type directives produce one merged output (AC)', async () => {
    // Use the dispatcher directly with a mock registry to verify the dedupe
    // path runs end-to-end.
    const { dispatch } = await import('../../../src/hooks/dispatcher.js')
    const { HookRegistry } = await import(
      '../../../src/core/registry/hook-registry.js'
    )
    const { buildDefaultConfig } = await import(
      '../../../src/core/config/defaults.js'
    )

    const registry = new HookRegistry()

    // Register two handlers for the same event, both emitting ROUTING_HINT directives.
    // handler-a has higher priority (10) → runs first; handler-b (5) runs second.
    // last-wins per type → handler-b's value wins.
    registry.register(
      'handler-a',
      'user-prompt-submit',
      async () => ({
        exitCode: 0 as const,
        systemInsert: createSystemDirective('ROUTING_HINT', 'directive from A'),
      }),
      { priority: 10 },
    )
    registry.register(
      'handler-b',
      'user-prompt-submit',
      async () => ({
        exitCode: 0 as const,
        systemInsert: createSystemDirective('ROUTING_HINT', 'directive from B'),
      }),
      { priority: 5 },
    )

    const ctx = {
      kind: 'user-prompt-submit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { prompt: 'test prompt' },
    }

    const result = await dispatch(registry, ctx)

    // Exactly one merged systemInsert — last-wins (handler-b)
    expect(result.systemInsert).toBeDefined()
    expect(result.systemInsert).toContain('directive from B')
    expect(result.systemInsert).not.toContain('directive from A')
  })

  it('two handlers with different types both appear in merged output', async () => {
    const { dispatch } = await import('../../../src/hooks/dispatcher.js')
    const { HookRegistry } = await import(
      '../../../src/core/registry/hook-registry.js'
    )
    const { buildDefaultConfig } = await import(
      '../../../src/core/config/defaults.js'
    )

    const registry = new HookRegistry()

    registry.register(
      'handler-bootstrap',
      'session-start',
      async () => ({
        exitCode: 0 as const,
        systemInsert: createSystemDirective('BOOTSTRAP', 'bootstrap context'),
      }),
      { priority: 10 },
    )
    registry.register(
      'handler-advisory',
      'session-start',
      async () => ({
        exitCode: 0 as const,
        systemInsert: createSystemDirective('ADVISORY', 'advisory note'),
      }),
      { priority: 5 },
    )

    const ctx = {
      kind: 'session-start' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: {},
    }

    const result = await dispatch(registry, ctx)
    expect(result.systemInsert).toContain('bootstrap context')
    expect(result.systemInsert).toContain('advisory note')
  })

  it('no systemInsert when no handler emits one', async () => {
    const { dispatch } = await import('../../../src/hooks/dispatcher.js')
    const { HookRegistry } = await import(
      '../../../src/core/registry/hook-registry.js'
    )
    const { buildDefaultConfig } = await import(
      '../../../src/core/config/defaults.js'
    )

    const registry = new HookRegistry()

    registry.register(
      'silent-handler',
      'session-start',
      async () => ({ exitCode: 0 as const }),
      { priority: 10 },
    )

    const ctx = {
      kind: 'session-start' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: {},
    }

    const result = await dispatch(registry, ctx)
    expect(result.systemInsert).toBeUndefined()
  })
})
