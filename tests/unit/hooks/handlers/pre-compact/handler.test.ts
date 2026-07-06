/**
 * Tests for the pre-compact sidecar handler (ANV-0126).
 *
 * Covers:
 *   - Writes a sidecar containing active-routing + active-skill snapshots.
 *   - Sidecar JSON validates via Zod and round-trips through parseSidecar.
 *   - Disable flag (config + env) suppresses the write.
 *   - Missing source files produce a sidecar with null fields.
 *   - SessionStart's restore reader picks up the sidecar within the window.
 *   - mtime > 1h ⇒ ignored.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../../src/core/config/defaults.js'
import type { HookKind, ModelsConfig } from '../../../../../src/core/types.js'
import { preCompactSidecarHandler } from '../../../../../src/hooks/handlers/pre-compact/handler.js'
import {
  buildSessionStartRestoreDigest,
  findLatestSidecarPath,
  tryRestore,
} from '../../../../../src/hooks/handlers/pre-compact/restore.js'
import { parseSidecar } from '../../../../../src/hooks/handlers/pre-compact/sidecar.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

let workDir: string

function makeProjectRoot() {
  // Anvil's findProjectRoot uses .git as a marker.
  mkdirSync(join(workDir, '.git'), { recursive: true })
}

function writeActiveState(opts: {
  skill?: Record<string, unknown> | null
  routing?: Record<string, unknown> | null
}) {
  mkdirSync(join(workDir, '.anvil'), { recursive: true })
  if (opts.skill !== undefined && opts.skill !== null) {
    writeFileSync(
      join(workDir, '.anvil', 'active-skill.json'),
      JSON.stringify(opts.skill),
    )
  }
  if (opts.routing !== undefined && opts.routing !== null) {
    writeFileSync(
      join(workDir, '.anvil', 'active-routing.json'),
      JSON.stringify(opts.routing),
    )
  }
}

function ctxFor(opts: {
  config?: ModelsConfig
  env?: Record<string, string>
  kind?: HookKind
}) {
  return {
    kind: (opts.kind ?? 'pre-compact') as HookKind,
    cwd: workDir,
    config: opts.config ?? buildDefaultConfig(),
    env: opts.env ?? {},
    payload: {},
  }
}

beforeEach(() => {
  workDir = createTestTmpDir('pre-compact-sidecar')
  makeProjectRoot()
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('preCompactSidecarHandler', () => {
  it('writes a sidecar containing active-routing and active-skill snapshots', async () => {
    writeActiveState({
      skill: { name: 'debug', intent: 'fix-broken' },
      routing: { systemInsert: '[DIRECTIVE:ROUTING_HINT] use debug' },
    })

    const r = await preCompactSidecarHandler(ctxFor({}))
    expect(r.exitCode).toBe(0)
    expect(r.message ?? '').toContain('.anvil/runtime/')

    const runtimeDir = join(workDir, '.anvil', 'runtime')
    expect(existsSync(runtimeDir)).toBe(true)
    const files = readdirSync(runtimeDir)
    const sidecarFile = files.find(
      (f) => f.startsWith('pre-compact-') && f.endsWith('.json'),
    )
    expect(sidecarFile).toBeDefined()

    const raw = readFileSync(join(runtimeDir, sidecarFile as string), 'utf-8')
    const parsed = parseSidecar(raw)
    expect(parsed).not.toBeNull()
    expect(parsed?.active_skill).toEqual({
      name: 'debug',
      intent: 'fix-broken',
    })
    expect(parsed?.active_routing).toEqual({
      systemInsert: '[DIRECTIVE:ROUTING_HINT] use debug',
    })
  })

  it('writes a sidecar with null fields when active-state files are missing', async () => {
    const r = await preCompactSidecarHandler(ctxFor({}))
    expect(r.exitCode).toBe(0)
    const files = readdirSync(join(workDir, '.anvil', 'runtime'))
    const sidecarFile = files.find((f) => f.startsWith('pre-compact-'))
    const raw = readFileSync(
      join(workDir, '.anvil', 'runtime', sidecarFile as string),
      'utf-8',
    )
    const parsed = parseSidecar(raw)
    expect(parsed?.active_skill).toBeNull()
    expect(parsed?.active_routing).toBeNull()
  })

  it('honors pre_compact.disable=true in config', async () => {
    const cfg: ModelsConfig = {
      ...buildDefaultConfig(),
      pre_compact: { disable: true },
    }
    const r = await preCompactSidecarHandler(ctxFor({ config: cfg }))
    expect(r.exitCode).toBe(0)
    expect(r.message).toBeUndefined()
    expect(existsSync(join(workDir, '.anvil', 'runtime'))).toBe(false)
  })

  it('honors ANVIL_DISABLE_PRE_COMPACT=1 env var', async () => {
    const r = await preCompactSidecarHandler(
      ctxFor({ env: { ANVIL_DISABLE_PRE_COMPACT: '1' } }),
    )
    expect(r.exitCode).toBe(0)
    expect(existsSync(join(workDir, '.anvil', 'runtime'))).toBe(false)
  })
})

describe('findLatestSidecarPath', () => {
  it('returns null when the runtime dir does not exist', () => {
    expect(findLatestSidecarPath(join(workDir, '.anvil', 'runtime'))).toBeNull()
  })

  it('returns the most-recently-modified sidecar', () => {
    const runtimeDir = join(workDir, '.anvil', 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    const a = join(runtimeDir, 'pre-compact-2026-01-01T00-00-00-000Z.json')
    const b = join(runtimeDir, 'pre-compact-2026-05-15T20-00-00-000Z.json')
    writeFileSync(a, '{}')
    writeFileSync(b, '{}')
    // Force mtimes so the test is deterministic
    const past = new Date('2026-01-01T00:00:00Z').getTime() / 1000
    const now = Date.now() / 1000
    utimesSync(a, past, past)
    utimesSync(b, now, now)
    expect(findLatestSidecarPath(runtimeDir)).toBe(b)
  })

  it('ignores files that do not match the naming convention', () => {
    const runtimeDir = join(workDir, '.anvil', 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    writeFileSync(join(runtimeDir, 'unrelated.json'), '{}')
    writeFileSync(join(runtimeDir, 'rule-reinforcement-counter.json'), '{}')
    expect(findLatestSidecarPath(runtimeDir)).toBeNull()
  })
})

describe('SessionStart restore digest', () => {
  it('returns a digest when a recent sidecar exists', async () => {
    writeActiveState({ skill: { name: 'debug', intent: 'fix-broken' } })
    await preCompactSidecarHandler(ctxFor({}))
    const digest = await buildSessionStartRestoreDigest({
      cwd: workDir,
      config: buildDefaultConfig(),
      env: {},
    })
    expect(digest).not.toBeNull()
    expect(digest ?? '').toContain('<session-restore>')
    expect(digest ?? '').toContain('name=debug')
  })

  it('returns null when no sidecar exists', async () => {
    const digest = await buildSessionStartRestoreDigest({
      cwd: workDir,
      config: buildDefaultConfig(),
      env: {},
    })
    expect(digest).toBeNull()
  })

  it('ignores sidecars older than the configured window', async () => {
    writeActiveState({ skill: { name: 'debug' } })
    await preCompactSidecarHandler(ctxFor({}))
    // Backdate sidecar mtime past the 1h window.
    const runtimeDir = join(workDir, '.anvil', 'runtime')
    const file = readdirSync(runtimeDir)[0]
    const past = (Date.now() - 2 * 60 * 60 * 1000) / 1000
    utimesSync(join(runtimeDir, file), past, past)

    const digest = await buildSessionStartRestoreDigest({
      cwd: workDir,
      config: buildDefaultConfig(),
      env: {},
    })
    expect(digest).toBeNull()
  })

  it('suppresses restore when ANVIL_DISABLE_PRE_COMPACT=1', async () => {
    writeActiveState({ skill: { name: 'debug' } })
    await preCompactSidecarHandler(ctxFor({}))
    const digest = await buildSessionStartRestoreDigest({
      cwd: workDir,
      config: buildDefaultConfig(),
      env: { ANVIL_DISABLE_PRE_COMPACT: '1' },
    })
    expect(digest).toBeNull()
  })

  it('honors a custom restore_window_ms', () => {
    const runtimeDir = join(workDir, '.anvil', 'runtime')
    mkdirSync(runtimeDir, { recursive: true })
    const path = join(runtimeDir, 'pre-compact-2026-05-15T20-00-00-000Z.json')
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        captured_at: new Date().toISOString(),
        active_skill: { name: 'debug' },
        active_routing: null,
        summary: null,
      }),
    )
    const tenSecAgo = (Date.now() - 10_000) / 1000
    utimesSync(path, tenSecAgo, tenSecAgo)
    // Window of 1s ⇒ stale.
    const stale = tryRestore({
      cwd: workDir,
      projectRoot: workDir,
      nowMs: Date.now(),
      windowMs: 1_000,
    })
    expect(stale.kind).toBe('none')
    // Window of 1m ⇒ fresh.
    const fresh = tryRestore({
      cwd: workDir,
      projectRoot: workDir,
      nowMs: Date.now(),
      windowMs: 60_000,
    })
    expect(fresh.kind).toBe('restore')
  })
})
