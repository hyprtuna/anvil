import { describe, expect, it } from 'vitest'
import {
  DIRECTIVE_DEFAULT_SEVERITY,
  ObservabilityDirective,
  ObservabilityDirectiveKind,
  buildDirective,
  compareSeverity,
  highestSeverity,
} from '../../../../src/core/observability/index.js'

describe('ObservabilityDirectiveKind enum', () => {
  it('lists exactly the seven canonical kinds', () => {
    expect(ObservabilityDirectiveKind.options.sort()).toEqual(
      [
        'compaction-imminent',
        'context-risk-high',
        'degradation-detected',
        'gate-required',
        'instructions-loaded',
        'plan-run-active',
        'verification-pending',
      ].sort(),
    )
  })

  it('has a default severity entry for every kind', () => {
    for (const kind of ObservabilityDirectiveKind.options) {
      expect(DIRECTIVE_DEFAULT_SEVERITY).toHaveProperty(kind)
    }
  })
})

describe('buildDirective', () => {
  it('builds a context-risk-high directive with default severity', () => {
    const d = buildDirective('context-risk-high', { usedPercent: 87 })
    expect(d.kind).toBe('context-risk-high')
    expect(d.severity).toBe('warn')
    expect(d.payload).toEqual({ usedPercent: 87 })
  })

  it('allows severity override', () => {
    const d = buildDirective(
      'context-risk-high',
      { usedPercent: 95 },
      { severity: 'critical' },
    )
    expect(d.severity).toBe('critical')
  })

  it('builds a degradation-detected directive with full payload', () => {
    const d = buildDirective('degradation-detected', {
      baselineRuleCount: 5,
      observedRuleCount: 3,
      lostRules: ['AGENTS.md', 'rules/anvil-routing.md'],
      snapshotPath: '/tmp/snap.md',
    })
    expect(d.kind).toBe('degradation-detected')
    expect(d.payload.lostRules).toHaveLength(2)
  })

  it('Zod-rejects context-risk-high payloads with out-of-range percent', () => {
    expect(() =>
      buildDirective('context-risk-high', { usedPercent: 150 }),
    ).toThrow()
  })

  it('Zod-rejects verification-pending payloads with empty target', () => {
    expect(() =>
      buildDirective('verification-pending', { target: '', reason: 'nope' }),
    ).toThrow()
  })

  it('Zod-rejects payload missing required fields', () => {
    expect(() =>
      // @ts-expect-error — intentional: validate runtime guards types too
      buildDirective('compaction-imminent', { preCompactBytes: 100 }),
    ).toThrow()
  })

  it('ObservabilityDirective.parse rejects unknown kinds', () => {
    expect(() =>
      ObservabilityDirective.parse({
        kind: 'made-up',
        severity: 'info',
        emittedAt: new Date().toISOString(),
        payload: {},
      }),
    ).toThrow()
  })

  it('emittedAt defaults to a parseable ISO string', () => {
    const d = buildDirective('plan-run-active', {
      runId: 'r1',
      status: 'in_progress',
    })
    expect(() => new Date(d.emittedAt).toISOString()).not.toThrow()
  })
})

describe('compareSeverity + highestSeverity', () => {
  it('orders info < warn < critical', () => {
    expect(compareSeverity('warn', 'info')).toBeGreaterThan(0)
    expect(compareSeverity('critical', 'warn')).toBeGreaterThan(0)
    expect(compareSeverity('info', 'critical')).toBeLessThan(0)
    expect(compareSeverity('info', 'info')).toBe(0)
  })

  it('returns undefined for an empty list', () => {
    expect(highestSeverity([])).toBeUndefined()
  })

  it('picks the highest-severity directive', () => {
    const directives = [
      buildDirective('plan-run-active', { runId: 'r', status: 's' }), // info
      buildDirective('context-risk-high', { usedPercent: 80 }), // warn
      buildDirective('compaction-imminent', {
        preCompactBytes: 1024,
        capturedRuleCount: 3,
        snapshotPath: '/tmp/s.md',
      }), // critical
    ]
    const winner = highestSeverity(directives)
    expect(winner?.kind).toBe('compaction-imminent')
  })

  it('breaks ties by first-emitted', () => {
    const a = buildDirective('context-risk-high', { usedPercent: 70 })
    const b = buildDirective('verification-pending', {
      target: 'tests',
      reason: 'pending',
    })
    const winner = highestSeverity([a, b])
    expect(winner).toBe(a)
  })
})
