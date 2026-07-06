import { describe, expect, it } from 'vitest'
import { buildPostCompactResult } from '../../../../../src/hooks/handlers/observability/post-compact.js'
import type { RuleSnapshot } from '../../../../../src/hooks/handlers/observability/snapshot-store.js'

const ISO = '2026-05-15T10:30:00.000Z'
const fixed = new Date(ISO)

function snapshot(names: string[], bytes = 100): RuleSnapshot {
  return { capturedAt: ISO, totalBytes: bytes, sourceNames: names }
}

describe('buildPostCompactResult', () => {
  it('returns no directive when baseline is missing', () => {
    const r = buildPostCompactResult(
      null,
      snapshot(['AGENTS.md']),
      undefined,
      fixed,
    )
    expect(r.directive).toBeNull()
    expect(r.lostRules).toEqual([])
  })

  it('returns no directive when no rules are missing', () => {
    const baseline = snapshot(['AGENTS.md', 'rules/r1.md'])
    const current = snapshot(['AGENTS.md', 'rules/r1.md'])
    const r = buildPostCompactResult(baseline, current, undefined, fixed)
    expect(r.directive).toBeNull()
    expect(r.lostRules).toEqual([])
  })

  it('emits degradation-detected when rules vanished', () => {
    const baseline = snapshot(['AGENTS.md', 'rules/r1.md', 'rules/r2.md'])
    const current = snapshot(['AGENTS.md'])
    const r = buildPostCompactResult(baseline, current, '/tmp/snap.json', fixed)
    expect(r.lostRules).toEqual(['rules/r1.md', 'rules/r2.md'])
    expect(r.directive).not.toBeNull()
    expect(r.directive?.kind).toBe('degradation-detected')
    expect(r.directive?.severity).toBe('critical')
    if (r.directive?.kind === 'degradation-detected') {
      expect(r.directive.payload.baselineRuleCount).toBe(3)
      expect(r.directive.payload.observedRuleCount).toBe(1)
      expect(r.directive.payload.lostRules).toEqual([
        'rules/r1.md',
        'rules/r2.md',
      ])
      expect(r.directive.payload.snapshotPath).toBe('/tmp/snap.json')
    }
  })

  it('captures only the rules that disappeared (not new ones)', () => {
    const baseline = snapshot(['A', 'B'])
    const current = snapshot(['A', 'C'])
    const r = buildPostCompactResult(baseline, current, undefined, fixed)
    expect(r.lostRules).toEqual(['B'])
    expect(r.directive?.kind).toBe('degradation-detected')
  })
})
