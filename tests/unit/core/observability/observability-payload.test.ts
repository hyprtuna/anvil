import { describe, expect, it } from 'vitest'
import {
  ObservabilityPayload,
  buildDirective,
  buildObservabilityPayload,
} from '../../../../src/core/observability/index.js'

describe('ObservabilityPayload', () => {
  it('defaults directives to an empty array', () => {
    const p = ObservabilityPayload.parse({})
    expect(p.directives).toEqual([])
  })

  it('round-trips a payload with directives + metadata', () => {
    const directive = buildDirective('context-risk-high', { usedPercent: 78 })
    const built = buildObservabilityPayload({
      directives: [directive],
      activeProfile: 'standard',
      installedBundle: 'balanced',
      currentPhase: 'implement',
    })
    expect(built.directives).toHaveLength(1)
    expect(built.activeProfile).toBe('standard')
    expect(built.installedBundle).toBe('balanced')
    expect(built.currentPhase).toBe('implement')
    // Round trip through Zod parse
    expect(ObservabilityPayload.parse(built)).toEqual(built)
  })

  it('passthrough preserves unknown keys (forward-compat)', () => {
    const parsed = ObservabilityPayload.parse({
      directives: [],
      futureField: 'still-here',
    })
    expect((parsed as Record<string, unknown>).futureField).toBe('still-here')
  })
})
