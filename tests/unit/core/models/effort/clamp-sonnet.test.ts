import { describe, expect, it } from 'vitest'
import { clampEffortForModel } from '../../../../../src/core/models/effort.js'

const SONNET = 'claude-sonnet-4-6'

describe('clampEffortForModel — Sonnet (low/medium/high/max; no xhigh)', () => {
  it('passes through low unchanged', () => {
    expect(clampEffortForModel(SONNET, 'low')).toBe('low')
  })
  it('passes through medium unchanged', () => {
    expect(clampEffortForModel(SONNET, 'medium')).toBe('medium')
  })
  it('passes through high unchanged', () => {
    expect(clampEffortForModel(SONNET, 'high')).toBe('high')
  })
  it('passes through max unchanged', () => {
    expect(clampEffortForModel(SONNET, 'max')).toBe('max')
  })
  it('clamps xhigh → high (xhigh not supported)', () => {
    expect(clampEffortForModel(SONNET, 'xhigh')).toBe('high')
  })
})
