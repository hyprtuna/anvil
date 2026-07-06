/**
 * v0.10.9 E-001 — `loadConfig()` must emit a one-line stderr warning and
 * fall back to defaults (rather than silently swallowing the error) when
 * `~/.anvil/models.json` exists but is malformed JSON.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../../../src/hooks/entrypoint.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('hooks/entrypoint — loadConfig() malformed-models warning (E-001)', () => {
  let tmp: string
  let prevHome: string | undefined
  let prevUserprofile: string | undefined
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = createTestTmpDir('loadconfig')
    mkdirSync(join(tmp, '.anvil'), { recursive: true })
    prevHome = process.env.HOME
    prevUserprofile = process.env.USERPROFILE
    process.env.HOME = tmp
    process.env.USERPROFILE = tmp
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    if (prevHome === undefined) {
      // biome-ignore lint/performance/noDelete: process.env.X = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
      delete process.env.HOME
    } else process.env.HOME = prevHome
    if (prevUserprofile === undefined) {
      // biome-ignore lint/performance/noDelete: process.env.X = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
      delete process.env.USERPROFILE
    } else process.env.USERPROFILE = prevUserprofile
    stderrSpy.mockRestore()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('emits exactly one stderr warning naming the path + error and returns default config', () => {
    writeFileSync(
      join(tmp, '.anvil', 'models.json'),
      '{ this is not: valid json',
      'utf-8',
    )

    const result = loadConfig()

    // Returns a non-null object (the default config), not throws.
    expect(result).toBeTruthy()
    expect(typeof result).toBe('object')

    // Exactly one stderr warning emitted.
    const warnings = stderrSpy.mock.calls.filter((call) => {
      const arg = call[0]
      return typeof arg === 'string' && arg.includes('malformed')
    })
    expect(warnings).toHaveLength(1)

    const line = warnings[0][0] as string
    expect(line).toContain('anvil hook:')
    expect(line).toContain('models.json')
    expect(line).toContain('malformed')
    expect(line).toContain('using defaults')
    expect(line.endsWith('\n')).toBe(true)
  })

  it('does not emit a warning when the file is absent', () => {
    // No models.json written.
    const result = loadConfig()
    expect(result).toBeTruthy()

    const warnings = stderrSpy.mock.calls.filter((call) => {
      const arg = call[0]
      return typeof arg === 'string' && arg.includes('malformed')
    })
    expect(warnings).toHaveLength(0)
  })

  it('does not emit a warning when the file is valid JSON', () => {
    writeFileSync(
      join(tmp, '.anvil', 'models.json'),
      JSON.stringify({ defaults: { model: 'sonnet' } }),
      'utf-8',
    )
    const result = loadConfig()
    expect(result).toEqual({ defaults: { model: 'sonnet' } })

    const warnings = stderrSpy.mock.calls.filter((call) => {
      const arg = call[0]
      return typeof arg === 'string' && arg.includes('malformed')
    })
    expect(warnings).toHaveLength(0)
  })
})
