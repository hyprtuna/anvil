import { describe, expect, it } from 'vitest'
import { clampEffortForModel } from '../../../../../src/core/models/effort.js'

const OPUS = 'claude-opus-4-7'

describe('clampEffortForModel — Opus (all 5 levels accepted)', () => {
  it('passes through low unchanged', () => {
    expect(clampEffortForModel(OPUS, 'low')).toBe('low')
  })
  it('passes through medium unchanged', () => {
    expect(clampEffortForModel(OPUS, 'medium')).toBe('medium')
  })
  it('passes through high unchanged', () => {
    expect(clampEffortForModel(OPUS, 'high')).toBe('high')
  })
  it('passes through xhigh unchanged', () => {
    expect(clampEffortForModel(OPUS, 'xhigh')).toBe('xhigh')
  })
  it('passes through max unchanged', () => {
    expect(clampEffortForModel(OPUS, 'max')).toBe('max')
  })
})
