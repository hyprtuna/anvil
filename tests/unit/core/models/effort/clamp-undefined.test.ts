import { describe, expect, it } from 'vitest'
import { clampEffortForModel } from '../../../../../src/core/models/effort.js'

describe('clampEffortForModel — requested: undefined', () => {
  it('returns undefined for Haiku with undefined request', () => {
    expect(clampEffortForModel('claude-haiku-4-5', undefined)).toBeUndefined()
  })
  it('returns undefined for Sonnet with undefined request', () => {
    expect(clampEffortForModel('claude-sonnet-4-6', undefined)).toBeUndefined()
  })
  it('returns undefined for Opus with undefined request', () => {
    expect(clampEffortForModel('claude-opus-4-7', undefined)).toBeUndefined()
  })
  it('returns undefined for unknown model with undefined request', () => {
    expect(clampEffortForModel('unknown-model', undefined)).toBeUndefined()
  })
})
