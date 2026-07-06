import { describe, expect, it } from 'vitest'
import { OpenCodeConfig } from '../../src/core/manifest-schema/opencode-config.js'

describe('OpenCodeConfig schema', () => {
  it('accepts an empty object', () => {
    expect(OpenCodeConfig.parse({})).toEqual({})
  })
  it('preserves unknown top-level keys', () => {
    const input = { plugin: ['a'], provider: { openai: { apiKey: '...' } } }
    expect(OpenCodeConfig.parse(input)).toMatchObject(input)
  })
  it('rejects non-string plugin entries', () => {
    expect(() => OpenCodeConfig.parse({ plugin: [{}] })).toThrow()
  })
})
