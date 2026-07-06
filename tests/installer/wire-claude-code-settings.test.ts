import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Force filesystem fallback by making `claude --version` always fail.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 1 })),
}))

import { CC_SETTINGS_SCHEMA_URL } from '../../src/core/manifest-schema/settings.js'
import { applySettingsTemplate } from '../../src/installer/wire-claude-code.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function makeTmpDir(): string {
  return createTestTmpDir('settings-template')
}

interface SettingsShape {
  $schema?: string
  permissions?: {
    allow?: unknown
    ask?: unknown
    deny?: unknown
    additionalDirectories?: unknown
    defaultMode?: string
  }
  effortLevel?: string
  disableAllHooks?: boolean
  _anvilNotes?: Record<string, unknown>
  [key: string]: unknown
}

function readSettings(claudeDir: string): SettingsShape {
  const raw = readFileSync(join(claudeDir, 'settings.json'), 'utf-8')
  return JSON.parse(raw) as SettingsShape
}

describe('applySettingsTemplate (Plan 28 G1)', () => {
  let tmpBase: string
  let claudeDir: string

  beforeEach(() => {
    tmpBase = makeTmpDir()
    claudeDir = join(tmpBase, '.claude')
    mkdirSync(claudeDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it('emits a fresh settings.json with $schema, permissions, effortLevel, disableAllHooks, _anvilNotes', async () => {
    await applySettingsTemplate({
      claudeDir,
      preset: 'balanced',
      effort: 'medium',
    })
    const out = readSettings(claudeDir)
    expect(out.$schema).toBe(CC_SETTINGS_SCHEMA_URL)
    expect(out.permissions).toBeDefined()
    expect(out.permissions?.allow).toEqual([])
    expect(out.permissions?.ask).toEqual([])
    expect(out.permissions?.deny).toEqual([])
    expect(out.permissions?.additionalDirectories).toEqual([])
    expect(out.permissions?.defaultMode).toBe('default')
    expect(out.disableAllHooks).toBe(false)
    expect(out.effortLevel).toBe('medium')
    expect(out._anvilNotes).toBeDefined()
    expect(out._anvilNotes?.sandbox).toEqual(expect.any(String))
    expect(out._anvilNotes?.outputStyle).toEqual(expect.any(String))
  })

  it('derives defaultMode=acceptEdits for speed-first preset', async () => {
    await applySettingsTemplate({
      claudeDir,
      preset: 'speed-first',
      effort: 'low',
    })
    const out = readSettings(claudeDir)
    expect(out.permissions?.defaultMode).toBe('acceptEdits')
  })

  it('clamps effort=max to effortLevel=xhigh (CC schema does not allow max)', async () => {
    await applySettingsTemplate({
      claudeDir,
      preset: 'max-quality',
      effort: 'max',
    })
    const out = readSettings(claudeDir)
    expect(out.effortLevel).toBe('xhigh')
  })

  it('is idempotent: rerunning with the same inputs does not duplicate keys or change values', async () => {
    await applySettingsTemplate({
      claudeDir,
      preset: 'balanced',
      effort: 'medium',
    })
    const first = readSettings(claudeDir)

    await applySettingsTemplate({
      claudeDir,
      preset: 'balanced',
      effort: 'medium',
    })
    const second = readSettings(claudeDir)
    expect(second).toEqual(first)
  })

  it('preserves user-edited permission rules but refreshes defaultMode from preset', async () => {
    // Pre-seed with a hand-edited file.
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify(
        {
          permissions: {
            allow: ['Bash(npm test)'],
            ask: [],
            deny: ['Bash(curl *)'],
            additionalDirectories: ['/extra'],
            defaultMode: 'acceptEdits',
          },
          customField: 'kept',
        },
        null,
        2,
      ),
    )

    await applySettingsTemplate({
      claudeDir,
      preset: 'balanced',
      effort: 'medium',
    })
    const out = readSettings(claudeDir)
    // User rules survive
    expect(out.permissions?.allow).toEqual(['Bash(npm test)'])
    expect(out.permissions?.deny).toEqual(['Bash(curl *)'])
    expect(out.permissions?.additionalDirectories).toEqual(['/extra'])
    // defaultMode refreshed from preset
    expect(out.permissions?.defaultMode).toBe('default')
    // Unknown user keys preserved
    expect(out.customField).toBe('kept')
  })

  it('does NOT overwrite a pre-existing effortLevel (user setting wins after init)', async () => {
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({ effortLevel: 'high' }),
    )
    await applySettingsTemplate({
      claudeDir,
      preset: 'balanced',
      effort: 'low',
    })
    const out = readSettings(claudeDir)
    expect(out.effortLevel).toBe('high')
  })

  it('does NOT add sandbox or outputStyle automatically — only documents them in _anvilNotes', async () => {
    await applySettingsTemplate({
      claudeDir,
      preset: 'balanced',
      effort: 'medium',
    })
    const out = readSettings(claudeDir)
    expect(out.sandbox).toBeUndefined()
    expect(out.outputStyle).toBeUndefined()
    expect(out._anvilNotes?.sandbox).toEqual(expect.stringContaining('sandbox'))
    expect(out._anvilNotes?.outputStyle).toEqual(
      expect.stringContaining('outputStyle'),
    )
  })

  it('omits effortLevel when the caller did not provide effort and none was previously set', async () => {
    await applySettingsTemplate({ claudeDir, preset: 'balanced' })
    const out = readSettings(claudeDir)
    expect(out.effortLevel).toBeUndefined()
    // permissions still emitted
    expect(out.permissions).toBeDefined()
  })

  it('falls back to defaultMode=default when no preset is supplied', async () => {
    await applySettingsTemplate({ claudeDir })
    const out = readSettings(claudeDir)
    expect(out.permissions?.defaultMode).toBe('default')
  })
})
