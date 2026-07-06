import { describe, expect, it } from 'vitest'
import {
  effortColor,
  modelColor,
} from '../../../../../src/commands/cli/common/output.js'

describe('commands/cli/common/output', () => {
  it('returns red for opus models', () => {
    expect(modelColor('claude-opus-4-6')).toBe('red')
  })
  it('returns yellow for sonnet models', () => {
    expect(modelColor('claude-sonnet-4-6')).toBe('yellow')
  })
  it('returns cyan for haiku models', () => {
    expect(modelColor('claude-haiku-4-5')).toBe('cyan')
  })
  it('returns white for unknown models', () => {
    expect(modelColor('claude-nova-9-9')).toBe('white')
  })
  it('effortColor maps all levels', () => {
    expect(effortColor('max')).toBe('red')
    expect(effortColor('xhigh')).toBe('yellow')
    expect(effortColor('high')).toBe('yellow')
    expect(effortColor('medium')).toBe('green')
    expect(effortColor('low')).toBe('gray')
  })
})
