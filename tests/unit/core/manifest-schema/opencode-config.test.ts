import { describe, expect, it } from 'vitest'
import { OpenCodeConfig } from '../../../../src/core/manifest-schema/opencode-config.js'

describe('OpenCodeConfig schema', () => {
  it('accepts known keys', () => {
    expect(() =>
      OpenCodeConfig.parse({ plugin: ['file://x'], skills: { paths: ['a'] } }),
    ).not.toThrow()
  })

  it('rejects unknown inner skills key', () => {
    expect(() =>
      OpenCodeConfig.parse({ skills: { paths: [], lazy_load: true } }),
    ).toThrow()
  })

  it('accepts unknown outer key (passthrough preserved)', () => {
    expect(() => OpenCodeConfig.parse({ unknownTopKey: 1 })).not.toThrow()
  })

  it('accepts skills with only paths defined', () => {
    expect(() =>
      OpenCodeConfig.parse({
        skills: { paths: ['/home/user/.anvil/skills/foo'] },
      }),
    ).not.toThrow()
  })

  it('accepts missing skills block entirely', () => {
    expect(() =>
      OpenCodeConfig.parse({ plugin: ['file:///path/to/plugin'] }),
    ).not.toThrow()
  })
})
