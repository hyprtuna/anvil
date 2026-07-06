import { describe, expect, it } from 'vitest'
import {
  buildDirective,
  buildObservabilityPayload,
  mergeStatuslinePayload,
  pickDirective,
  renderDirective,
} from '../../../../src/core/observability/index.js'
import type { PlanRunStatuslinePayload } from '../../../../src/core/plans/runner/statusline-payload.js'

const basePayload: PlanRunStatuslinePayload = {
  planRun: {
    runId: 'r1',
    planVersion: '0.14.0',
    status: 'in_progress',
  },
}

describe('mergeStatuslinePayload', () => {
  it('passes through the planRun payload when observability is undefined', () => {
    const merged = mergeStatuslinePayload(basePayload)
    expect(merged.planRun).toEqual(basePayload.planRun)
    expect(merged.observability).toBeUndefined()
  })

  it('attaches observability without mutating the base', () => {
    const directive = buildDirective('context-risk-high', { usedPercent: 80 })
    const obs = buildObservabilityPayload({ directives: [directive] })
    const merged = mergeStatuslinePayload(basePayload, obs)
    expect(merged.planRun).toEqual(basePayload.planRun)
    expect(merged.observability?.directives).toHaveLength(1)
    // base unchanged
    expect(
      (basePayload as PlanRunStatuslinePayload & { observability?: unknown })
        .observability,
    ).toBeUndefined()
  })
})

describe('pickDirective', () => {
  it('returns the highest-severity directive', () => {
    const a = buildDirective('plan-run-active', { runId: 'r', status: 's' }) // info
    const b = buildDirective('context-risk-high', { usedPercent: 80 }) // warn
    const c = buildDirective('degradation-detected', {
      baselineRuleCount: 5,
      observedRuleCount: 3,
      lostRules: ['A', 'B'],
    }) // critical
    expect(pickDirective([a, b, c])).toBe(c)
  })

  it('returns undefined for empty input', () => {
    expect(pickDirective([])).toBeUndefined()
  })
})

describe('renderDirective', () => {
  it('renders context-risk-high as [ctx N%]', () => {
    const d = buildDirective('context-risk-high', { usedPercent: 78 })
    expect(renderDirective(d).fragment).toBe('[ctx 78%]')
  })

  it('rounds the percentage', () => {
    const d = buildDirective('context-risk-high', { usedPercent: 77.6 })
    expect(renderDirective(d).fragment).toBe('[ctx 78%]')
  })

  it('renders compaction-imminent with bytes in KB', () => {
    const d = buildDirective('compaction-imminent', {
      preCompactBytes: 12345,
      capturedRuleCount: 4,
      snapshotPath: '/x/y',
    })
    expect(renderDirective(d).fragment).toBe('[compacting 12.1KB]')
  })

  it('renders degradation-detected with the count of lost rules', () => {
    const d = buildDirective('degradation-detected', {
      baselineRuleCount: 4,
      observedRuleCount: 2,
      lostRules: ['a', 'b'],
    })
    expect(renderDirective(d).fragment).toBe('[rules lost: 2]')
  })

  it('renders verification-pending with target', () => {
    const d = buildDirective('verification-pending', {
      target: 'tests',
      reason: 'pending',
    })
    expect(renderDirective(d).fragment).toBe('[verify: tests]')
  })

  it('renders gate-required with the gate name', () => {
    const d = buildDirective('gate-required', { gate: 'pre-push' })
    expect(renderDirective(d).fragment).toBe('[gate: pre-push]')
  })

  it('renders plan-run-active with status', () => {
    const d = buildDirective('plan-run-active', {
      runId: 'r1',
      status: 'in_progress',
    })
    expect(renderDirective(d).fragment).toBe('[plan: in_progress]')
  })

  it('renders instructions-loaded with rule count', () => {
    const d = buildDirective('instructions-loaded', {
      totalBytes: 4096,
      ruleCount: 3,
      sourceNames: ['a', 'b', 'c'],
    })
    expect(renderDirective(d).fragment).toBe('[rules: 3]')
  })

  it('surfaces the severity alongside the fragment', () => {
    const d = buildDirective('compaction-imminent', {
      preCompactBytes: 100,
      capturedRuleCount: 1,
      snapshotPath: '/x',
    })
    expect(renderDirective(d).severity).toBe('critical')
  })
})
