import { afterEach, describe, expect, it } from 'vitest'
import {
  BUILTIN_SUPPORTED_EFFORTS,
  clampEffortForModel,
  registerSupportedEfforts,
} from '../../../../../src/core/models/effort.js'

describe('registerSupportedEfforts — provider-extensible registry', () => {
  const MODEL_ID = 'gpt-5.5'

  afterEach(() => {
    // Clean up any entries added during the test to avoid polluting global state
    delete (BUILTIN_SUPPORTED_EFFORTS as Record<string, unknown>)[MODEL_ID]
  })

  it('makes a new model clampable after registration', () => {
    registerSupportedEfforts(MODEL_ID, ['low', 'medium', 'high'])
    expect(clampEffortForModel(MODEL_ID, 'high')).toBe('high')
  })

  it('clamps down when requested effort exceeds the registered list', () => {
    registerSupportedEfforts(MODEL_ID, ['low', 'medium', 'high'])
    // 'max' is above 'high', so should clamp to 'high'
    expect(clampEffortForModel(MODEL_ID, 'max')).toBe('high')
  })

  it('can use injected registry without touching global state', () => {
    const localRegistry = { 'gpt-5.5': ['low', 'medium', 'high'] as const }
    expect(clampEffortForModel('gpt-5.5', 'max', localRegistry)).toBe('high')
    // Global still returns undefined (model not registered globally in this path)
    expect(clampEffortForModel('gpt-5.5', 'max')).toBeUndefined()
  })
})
