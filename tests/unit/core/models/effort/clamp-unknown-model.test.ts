import { describe, expect, it } from 'vitest'
import { clampEffortForModel } from '../../../../../src/core/models/effort.js'

describe('clampEffortForModel — unknown model id', () => {
  it('returns undefined for any effort when model is not in registry', () => {
    expect(clampEffortForModel('gpt-99-turbo', 'medium')).toBeUndefined()
  })
  it('returns undefined for max effort when model is not in registry', () => {
    expect(clampEffortForModel('some-future-model', 'max')).toBeUndefined()
  })
  it('returns undefined even for low effort on unknown model', () => {
    expect(clampEffortForModel('o3-mini', 'low')).toBeUndefined()
  })
})
