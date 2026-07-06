/**
 * ANV-0128 — doctor row: "Hook profiles" surfaces the active profile per
 * handler that declares a profile manifest.
 *
 * The row reads the current config + registered hooks and produces a
 * "handler=profile" list (e.g., "memory-validator=balanced, prompt-guard=balanced").
 */
import { describe, expect, it } from 'vitest'
import { buildHookProfilesRow } from '../../../../src/commands/cli/doctor-checks/hooks.js'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'

describe('buildHookProfilesRow', () => {
  it('lists each manifested handler with its default profile by default', () => {
    const cfg = buildDefaultConfig()
    const row = buildHookProfilesRow(cfg)
    expect(row.name).toBe('Hook profiles')
    expect(row.status).toBe('pass')
    expect(row.detail).toContain('memory-validator=balanced')
    expect(row.detail).toContain('prompt-guard=balanced')
  })

  it('reflects config overrides in the row detail', () => {
    const cfg = buildDefaultConfig()
    cfg.hooks = {
      ...(cfg.hooks ?? {}),
      'memory-validator': { profile: 'strict' },
      'prompt-guard': { profile: 'minimal' },
    }
    const row = buildHookProfilesRow(cfg)
    expect(row.detail).toContain('memory-validator=strict')
    expect(row.detail).toContain('prompt-guard=minimal')
  })

  it('falls back to default when config specifies an unknown profile', () => {
    const cfg = buildDefaultConfig()
    cfg.hooks = {
      ...(cfg.hooks ?? {}),
      'memory-validator': { profile: 'bogus' },
    }
    const row = buildHookProfilesRow(cfg)
    expect(row.detail).toContain('memory-validator=balanced')
  })

  it('renders pass when at least one handler is manifested', () => {
    const cfg = buildDefaultConfig()
    const row = buildHookProfilesRow(cfg)
    expect(row.status).toBe('pass')
  })
})
