import { describe, expect, it } from 'vitest'
import { buildPreCompactResult } from '../../../../../src/hooks/handlers/observability/pre-compact.js'
import type { RuleSnapshot } from '../../../../../src/hooks/handlers/observability/snapshot-store.js'

describe('buildPreCompactResult', () => {
  it('emits a critical compaction-imminent directive with baseline data', () => {
    const baseline: RuleSnapshot = {
      capturedAt: '2026-05-15T10:00:00.000Z',
      totalBytes: 8192,
      sourceNames: ['AGENTS.md', 'rules/anvil-routing.md'],
    }
    const fixed = new Date('2026-05-15T10:30:00.000Z')
    const result = buildPreCompactResult('/repo', baseline, fixed)
    expect(result.snapshot.totalBytes).toBe(8192)
    expect(result.snapshot.sourceNames).toEqual(baseline.sourceNames)
    expect(result.directive.kind).toBe('compaction-imminent')
    expect(result.directive.severity).toBe('critical')
    if (result.directive.kind === 'compaction-imminent') {
      expect(result.directive.payload.preCompactBytes).toBe(8192)
      expect(result.directive.payload.capturedRuleCount).toBe(2)
      expect(result.directive.payload.snapshotPath).toContain(
        '.anvil/notepads/observability',
      )
    }
  })

  it('synthesises an empty baseline when none is supplied', () => {
    const result = buildPreCompactResult('/repo', null)
    expect(result.snapshot.totalBytes).toBe(0)
    expect(result.snapshot.sourceNames).toEqual([])
    expect(result.directive.kind).toBe('compaction-imminent')
  })
})
