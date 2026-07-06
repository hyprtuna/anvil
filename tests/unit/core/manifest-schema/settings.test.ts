import { describe, expect, it } from 'vitest'
import {
  CC_SETTINGS_SCHEMA_URL,
  ClaudeCodeSettings,
  presetToDefaultMode,
} from '../../../../src/core/manifest-schema/settings.js'

describe('ClaudeCodeSettings — Zod schema', () => {
  it('parses an empty object', () => {
    expect(ClaudeCodeSettings.parse({})).toEqual({})
  })

  it('accepts the full Anvil-emitted template', () => {
    const input = {
      $schema: CC_SETTINGS_SCHEMA_URL,
      permissions: {
        allow: [],
        ask: [],
        deny: [],
        additionalDirectories: [],
        defaultMode: 'default',
      },
      hooks: {
        SessionStart: [
          {
            matcher: '',
            hooks: [{ type: 'command', command: '/path/to/hook.cjs' }],
          },
        ],
      },
      statusLine: {
        type: 'command',
        command: '/anvil/bin/anvil.cjs statusline',
        padding: 0,
        refreshInterval: 5,
      },
      effortLevel: 'medium',
      disableAllHooks: false,
      _anvilNotes: { _: 'hint' },
    }
    const out = ClaudeCodeSettings.parse(input)
    expect(out.$schema).toBe(CC_SETTINGS_SCHEMA_URL)
    expect(out.permissions?.defaultMode).toBe('default')
    expect(out.effortLevel).toBe('medium')
  })

  it('rejects invalid effortLevel values', () => {
    const result = ClaudeCodeSettings.safeParse({ effortLevel: 'bogus' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid permissions.defaultMode values', () => {
    const result = ClaudeCodeSettings.safeParse({
      permissions: { defaultMode: 'launchMissiles' },
    })
    expect(result.success).toBe(false)
  })

  it('passes through unknown top-level keys (forward-compat)', () => {
    const input = {
      $schema: CC_SETTINGS_SCHEMA_URL,
      // newField is not in the schema — passthrough should preserve it
      newField: { something: true },
    }
    const result = ClaudeCodeSettings.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect((result.data as Record<string, unknown>).newField).toEqual({
        something: true,
      })
    }
  })

  it('accepts loose hook entries (full validation lives in claude-code.ts)', () => {
    const result = ClaudeCodeSettings.safeParse({
      hooks: {
        // Loose: hooks array entries are records — discriminated union
        // for handler types is enforced elsewhere.
        PreToolUse: [
          { matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] },
          { matcher: '', hooks: [{ type: 'http', url: 'https://x' }] },
        ],
      },
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-boolean disableAllHooks', () => {
    const result = ClaudeCodeSettings.safeParse({ disableAllHooks: 'yes' })
    expect(result.success).toBe(false)
  })
})

describe('presetToDefaultMode', () => {
  it('maps speed-first to acceptEdits', () => {
    expect(presetToDefaultMode('speed-first')).toBe('acceptEdits')
  })

  it('maps balanced / max-quality / cost-optimised to default', () => {
    expect(presetToDefaultMode('balanced')).toBe('default')
    expect(presetToDefaultMode('max-quality')).toBe('default')
    expect(presetToDefaultMode('cost-optimised')).toBe('default')
  })

  it('falls back to default for unknown presets', () => {
    expect(presetToDefaultMode('totally-made-up')).toBe('default')
  })
})
