import { describe, expect, it } from 'vitest'
import { isCcUserWired } from '../../../../src/commands/cli/doctor.js'

describe('isCcUserWired', () => {
  it('returns true for v2 schema with anvil@anvil and scope "user"', () => {
    const obj = {
      version: 2,
      plugins: {
        'anvil@anvil': [
          {
            scope: 'user',
            installPath: '/home/user/.anvil/plugins/claude-code',
            version: '0.2.0',
          },
        ],
      },
    }
    expect(isCcUserWired(obj)).toBe(true)
  })

  it('returns false for v2 schema with anvil@anvil only under scope "project" (user wiring absent)', () => {
    const obj = {
      version: 2,
      plugins: {
        'anvil@anvil': [
          {
            scope: 'project',
            installPath: '/project/.anvil',
            version: '0.2.0',
          },
        ],
      },
    }
    // Only project scope — user wiring is absent, so doctor should warn
    expect(isCcUserWired(obj)).toBe(false)
  })

  it('returns false for flat top-level legacy key "anvil@anvil" (no nested plugins)', () => {
    const obj = {
      'anvil@anvil': [{ scope: 'user', installPath: '/home/user/.anvil' }],
    }
    expect(isCcUserWired(obj)).toBe(false)
  })

  it('returns false when installed_plugins.json is missing (null)', () => {
    expect(isCcUserWired(null)).toBe(false)
  })

  it('returns false for malformed JSON (non-object)', () => {
    expect(isCcUserWired('not an object')).toBe(false)
    expect(isCcUserWired(42)).toBe(false)
    expect(isCcUserWired([])).toBe(false)
  })

  it('returns false when plugins key is present but anvil@anvil is absent', () => {
    const obj = {
      version: 2,
      plugins: {
        'superpowers@claude-plugins-official': [{ scope: 'user' }],
      },
    }
    expect(isCcUserWired(obj)).toBe(false)
  })

  it('returns false when anvil@anvil entry array is empty', () => {
    const obj = {
      version: 2,
      plugins: {
        'anvil@anvil': [],
      },
    }
    expect(isCcUserWired(obj)).toBe(false)
  })

  it('returns false when plugins is not an object', () => {
    const obj = {
      version: 2,
      plugins: ['anvil@anvil'],
    }
    expect(isCcUserWired(obj)).toBe(false)
  })
})
