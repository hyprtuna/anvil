/**
 * Tests for the batch format + typecheck extension in stop.ts — Plan 39 Phase H.
 *
 * Verifies that the stop handler:
 * - Reads the edit-accumulator state for the session.
 * - Skips spawn when accumulator is empty.
 * - Spawns biome format when format-eligible files are present.
 * - Spawns tsc when TypeScript files are present.
 * - Skips tsc when only non-TS files are accumulated.
 * - Clears the accumulator on success.
 * - Survives partial spawn failure (logs, keeps running, returns exitCode 0).
 * - Preserves the existing clearActiveSkill (active-skill.json removal) behavior.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { getProjectScopedPath } from '../../../../src/core/io/project-scoped-paths.js'
import type { HookKind } from '../../../../src/core/types.js'
import {
  loadAccumState,
  persistAccumState,
  resetAccumCache,
} from '../../../../src/hooks/handlers/post-edit-accumulator.js'
import {
  resetSpawnFn,
  runBatchFormat,
  runTypeCheck,
  setSpawnFn,
  stopHandler,
} from '../../../../src/hooks/handlers/stop.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION = 'stop-batch-test-session'

function makeCtx(cwd: string, sessionId?: string) {
  return {
    kind: 'stop' as HookKind,
    cwd,
    config: buildDefaultConfig(),
    env: {},
    payload: sessionId ? { session_id: sessionId } : {},
  }
}

type SpawnResult = ReturnType<typeof spawnSync>

function fakeSpawnOk(): SpawnResult {
  return {
    status: 0,
    error: undefined,
    stdout: '',
    stderr: '',
    pid: 1,
    signal: null,
    output: [null, null, null],
  }
}

function fakeSpawnFail(): SpawnResult {
  return {
    status: 1,
    error: undefined,
    stdout: 'some output',
    stderr: 'error detail',
    pid: 1,
    signal: null,
    output: [null, null, null],
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  resetAccumCache()
})

afterEach(() => {
  resetAccumCache()
  resetSpawnFn()
  vi.restoreAllMocks()
})

// ─── 1. Empty accumulator → noop ─────────────────────────────────────────────

describe('stop handler: empty accumulator', () => {
  it('returns exitCode 0 without spawning when accumulator is empty', async () => {
    const spawnCalls: string[] = []
    setSpawnFn((cmd: string) => {
      spawnCalls.push(cmd)
      return fakeSpawnOk()
    })

    const result = await stopHandler(makeCtx(tmpdir(), SESSION))

    expect(result.exitCode).toBe(0)
    // No spawn calls for format/tsc since accumulator is empty
    expect(spawnCalls).toHaveLength(0)
  })
})

// ─── 2. Non-empty accumulator → batched format spawned ───────────────────────

describe('stop handler: non-empty accumulator', () => {
  it('spawns biome check --write when TS files are accumulated', async () => {
    await persistAccumState(SESSION, new Set(['/src/foo.ts', '/src/bar.ts']))

    const spawnCalls: Array<[string, string[]]> = []
    setSpawnFn((cmd: string, args?: readonly string[]) => {
      spawnCalls.push([cmd, Array.from(args ?? [])])
      return fakeSpawnOk()
    })

    const result = await stopHandler(makeCtx(tmpdir(), SESSION))

    expect(result.exitCode).toBe(0)
    const biomeCall = spawnCalls.find(([, args]) => args.includes('biome'))
    expect(biomeCall).toBeDefined()
    expect(biomeCall![1]).toContain('check')
    expect(biomeCall![1]).toContain('--write')
  })
})

// ─── 3. Clears accumulator on success ────────────────────────────────────────

describe('stop handler: accumulator cleared on success', () => {
  it('accumulator is empty after successful batch run', async () => {
    await persistAccumState(SESSION, new Set(['/src/foo.ts']))

    setSpawnFn(() => fakeSpawnOk())

    await stopHandler(makeCtx(tmpdir(), SESSION))

    // After success, the accumulator should be cleared
    resetAccumCache()
    const remaining = await loadAccumState(SESSION)
    expect(remaining.size).toBe(0)
  })
})

// ─── 4. Partial failure: format fails → logs but doesn't crash ───────────────

describe('stop handler: partial failure recovery', () => {
  it('returns exitCode 0 even when biome spawn fails', async () => {
    await persistAccumState(SESSION, new Set(['/src/foo.ts']))

    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    setSpawnFn(() => fakeSpawnFail())

    const result = await stopHandler(makeCtx(tmpdir(), SESSION))

    // Must still return 0 (never blocks)
    expect(result.exitCode).toBe(0)
  })

  it('accumulator is retained when batch run partially fails', async () => {
    await persistAccumState(SESSION, new Set(['/src/foo.ts']))

    setSpawnFn(() => fakeSpawnFail())
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    await stopHandler(makeCtx(tmpdir(), SESSION))

    // Accumulator should be retained since the run failed
    resetAccumCache()
    const remaining = await loadAccumState(SESSION)
    expect(remaining.size).toBeGreaterThan(0)
  })
})

// ─── 5. Tsc skipped for non-TS files ─────────────────────────────────────────

describe('stop handler: tsc skipped for non-TS files', () => {
  it('spawns biome but not tsc when only .js files are accumulated', async () => {
    await persistAccumState(SESSION, new Set(['/src/foo.js']))

    const spawnCalls: Array<[string, string[]]> = []
    setSpawnFn((cmd: string, args?: readonly string[]) => {
      spawnCalls.push([cmd, Array.from(args ?? [])])
      return fakeSpawnOk()
    })

    await stopHandler(makeCtx(tmpdir(), SESSION))

    const tscCall = spawnCalls.find(([, args]) => args.includes('tsc'))
    expect(tscCall).toBeUndefined()

    const biomeCall = spawnCalls.find(([, args]) => args.includes('biome'))
    expect(biomeCall).toBeDefined()
  })
})

// ─── 6. clearActiveSkill preserved ───────────────────────────────────────────

describe('stop handler: clearActiveSkill behavior preserved', () => {
  let fakeAnvilHome: string
  let tmpCwd: string

  beforeEach(() => {
    fakeAnvilHome = join(tmpdir(), `stop-anvil-home-${Date.now()}`)
    tmpCwd = join(tmpdir(), `stop-test-${Date.now()}`)
    mkdirSync(tmpCwd, { recursive: true })
    process.env.ANVIL_HOME = fakeAnvilHome
  })

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
    try {
      rmSync(fakeAnvilHome, { recursive: true, force: true })
    } catch {
      // ignore
    }
    try {
      rmSync(tmpCwd, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('deletes per-project active-skill.json if it exists', async () => {
    // Write to the project-scoped path (which requires ensureProjectDir first)
    const skillPath = await getProjectScopedPath(tmpCwd, 'active-skill')
    mkdirSync(join(skillPath, '..'), { recursive: true })
    writeFileSync(skillPath, JSON.stringify({ skill: 'development' }), 'utf-8')

    expect(existsSync(skillPath)).toBe(true)

    const ctx = makeCtx(tmpCwd, SESSION)
    await stopHandler(ctx)

    expect(existsSync(skillPath)).toBe(false)
  })

  it('returns exitCode 0 even when active-skill.json is absent', async () => {
    const ctx = makeCtx(tmpCwd, SESSION)
    const result = await stopHandler(ctx)
    expect(result.exitCode).toBe(0)
  })
})

// ─── runBatchFormat unit-level tests ─────────────────────────────────────────

describe('runBatchFormat()', () => {
  it('returns true when biome exits 0', () => {
    setSpawnFn(() => fakeSpawnOk())
    expect(runBatchFormat(['/src/foo.ts'], tmpdir())).toBe(true)
  })

  it('returns false when biome exits non-zero', () => {
    setSpawnFn(() => fakeSpawnFail())
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(runBatchFormat(['/src/foo.ts'], tmpdir())).toBe(false)
  })

  it('returns true with no files (no-op path)', () => {
    // No setSpawnFn needed — returns early before spawn
    expect(runBatchFormat([], tmpdir())).toBe(true)
  })
})

// ─── runTypeCheck unit-level tests ───────────────────────────────────────────

describe('runTypeCheck()', () => {
  it('returns true when tsc exits 0', () => {
    setSpawnFn(() => fakeSpawnOk())
    expect(runTypeCheck(tmpdir())).toBe(true)
  })

  it('returns false when tsc exits non-zero', () => {
    setSpawnFn(() => ({
      status: 1,
      error: undefined,
      stdout: 'error TS2345...',
      stderr: '',
      pid: 1,
      signal: null,
      output: [null, null, null] as [null, null, null],
    }))
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    expect(runTypeCheck(tmpdir())).toBe(false)
  })
})
