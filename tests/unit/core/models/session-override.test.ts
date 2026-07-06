import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { resolveModel } from '../../../../src/core/models/resolve.js'
import type { ActiveModelFile } from '../../../../src/core/types.js'

// ---------------------------------------------------------------------------
// resolveModel — session-override layer (Plan 30 G1)
// ---------------------------------------------------------------------------

describe('core/models/resolve — session-override layer', () => {
  const config = buildDefaultConfig()

  const sessionOverride: ActiveModelFile = {
    model: 'claude-haiku-4-5',
    effort: 'low',
    set_at: '2026-04-25T00:00:00.000Z',
  }

  it('applies session override when present', () => {
    const r = resolveModel('planning', config, { session: sessionOverride })
    expect(r.source).toBe('session')
    expect(r.model).toBe('claude-haiku-4-5')
    // Plan 38 Phase A: Haiku does not accept effort; effort is clamped to undefined
    expect(r.effort).toBeUndefined()
  })

  it('session defaults effort to config default when effort is absent', () => {
    const override: ActiveModelFile = {
      model: 'claude-sonnet-4-6',
      set_at: '2026-04-25T00:00:00.000Z',
    }
    const r = resolveModel('planning', config, { session: override })
    expect(r.source).toBe('session')
    expect(r.model).toBe('claude-sonnet-4-6')
    expect(r.effort).toBe(config.defaults.effort)
  })

  it('session override is no-op when session is null', () => {
    const r = resolveModel('planning', config, { session: null })
    expect(r.source).toBe('group')
  })

  it('session override is no-op when session is absent', () => {
    const r = resolveModel('planning', config)
    expect(r.source).toBe('group')
  })

  it('CLI wins over session override (CLI is layer 1, session is layer 2)', () => {
    // Use claude-opus-4-7 (known to BUILTIN_SUPPORTED_EFFORTS; claude-opus-4-6 is unknown → effort clamps to undefined)
    const r = resolveModel('planning', config, {
      session: sessionOverride,
      cli: { model: 'claude-opus-4-7', effort: 'max' },
    })
    expect(r.source).toBe('cli')
    expect(r.model).toBe('claude-opus-4-7')
    expect(r.effort).toBe('max')
  })

  it('session wins over ENV (session is layer 2, ENV is layer 3)', () => {
    const r = resolveModel('planning', config, {
      session: sessionOverride,
      env: { ANVIL_MODEL: 'claude-opus-4-6' },
    })
    expect(r.source).toBe('session')
    expect(r.model).toBe('claude-haiku-4-5')
  })

  it('ENV wins when session is null', () => {
    const r = resolveModel('planning', config, {
      session: null,
      env: { ANVIL_MODEL: 'claude-opus-4-6' },
    })
    expect(r.source).toBe('env')
    expect(r.model).toBe('claude-opus-4-6')
  })

  it('resolves alias in session model', () => {
    const override: ActiveModelFile = {
      model: 'fast',
      set_at: '2026-04-25T00:00:00.000Z',
    }
    const r = resolveModel('planning', config, { session: override })
    expect(r.source).toBe('session')
    // Resolver expands the chain fully: 'fast' → 'haiku' → 'claude-haiku-4-5'.
    expect(r.model).toBe('claude-haiku-4-5')
  })
})

// ---------------------------------------------------------------------------
// loadSessionOverride — disk-read helper (Plan 30 G1)
// ---------------------------------------------------------------------------
describe('core/models/session — loadSessionOverride', () => {
  it('returns null when file is absent', async () => {
    const { loadSessionOverride } = await import(
      '../../../../src/core/models/session.js'
    )
    const r = await loadSessionOverride('/tmp/anvil-test-nonexistent-dir')
    expect(r).toBeNull()
  })

  it('returns null and warns for malformed JSON', async () => {
    const tmpDir = `/tmp/anvil-session-test-${process.pid}`
    mkdirSync(`${tmpDir}/.anvil`, { recursive: true })
    writeFileSync(`${tmpDir}/.anvil/active-model.json`, 'not-json', 'utf-8')

    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const { loadSessionOverride } = await import(
        '../../../../src/core/models/session.js'
      )
      const r = await loadSessionOverride(tmpDir)
      expect(r).toBeNull()
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('not valid JSON'),
      )
    } finally {
      stderrSpy.mockRestore()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('returns null and warns for schema-invalid JSON', async () => {
    const tmpDir = `/tmp/anvil-session-schema-test-${process.pid}`
    mkdirSync(`${tmpDir}/.anvil`, { recursive: true })
    writeFileSync(
      `${tmpDir}/.anvil/active-model.json`,
      JSON.stringify({ wrong: 'shape' }),
      'utf-8',
    )

    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const { loadSessionOverride } = await import(
        '../../../../src/core/models/session.js'
      )
      const r = await loadSessionOverride(tmpDir)
      expect(r).toBeNull()
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid shape'),
      )
    } finally {
      stderrSpy.mockRestore()
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('parses a valid active-model.json', async () => {
    const tmpDir = `/tmp/anvil-session-valid-test-${process.pid}`
    mkdirSync(`${tmpDir}/.anvil`, { recursive: true })
    const file: ActiveModelFile = {
      model: 'claude-sonnet-4-6',
      effort: 'high',
      set_at: '2026-04-25T10:00:00.000Z',
    }
    writeFileSync(
      `${tmpDir}/.anvil/active-model.json`,
      JSON.stringify(file),
      'utf-8',
    )

    try {
      const { loadSessionOverride } = await import(
        '../../../../src/core/models/session.js'
      )
      const r = await loadSessionOverride(tmpDir)
      expect(r).not.toBeNull()
      expect(r?.model).toBe('claude-sonnet-4-6')
      expect(r?.effort).toBe('high')
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
