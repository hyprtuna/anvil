import { describe, expect, it } from 'vitest'
import { clampEffortForModel } from '../../../../../src/core/models/effort.js'

const HAIKU = 'claude-haiku-4-5'

describe('clampEffortForModel — Haiku (no effort accepted)', () => {
  it('returns undefined for low', () => {
    expect(clampEffortForModel(HAIKU, 'low')).toBeUndefined()
  })
  it('returns undefined for medium', () => {
    expect(clampEffortForModel(HAIKU, 'medium')).toBeUndefined()
  })
  it('returns undefined for high', () => {
    expect(clampEffortForModel(HAIKU, 'high')).toBeUndefined()
  })
  it('returns undefined for xhigh', () => {
    expect(clampEffortForModel(HAIKU, 'xhigh')).toBeUndefined()
  })
  it('returns undefined for max', () => {
    expect(clampEffortForModel(HAIKU, 'max')).toBeUndefined()
  })
})
