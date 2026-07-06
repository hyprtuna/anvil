import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { sessionEndHandler } from '../../../../src/hooks/handlers/session-end.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTestTmpDir('session-end-test')
})

afterEach(() => {
  // clean up tmpdir (best-effort)
  try {
    rmSync(tmpDir, { recursive: true })
  } catch {
    // ignore
  }
})

function makeCtx(payload: unknown, cwd?: string) {
  return {
    kind: 'session-end' as const,
    cwd: cwd ?? tmpDir,
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

describe('hooks/handlers/session-end', () => {
  it('returns SUCCESS with session summary when payload has data', async () => {
    const r = await sessionEndHandler(
      makeCtx({
        filesModified: ['src/index.ts', 'src/core/types.ts'],
        commitsCreated: 3,
        tokensUsed: 45_000,
        durationMs: 120_000,
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('session-end')
    expect(r.message).toContain('2 files')
    expect(r.message).toContain('3 commits')
    expect(r.context).toMatchObject({
      filesModified: ['src/index.ts', 'src/core/types.ts'],
      commitsCreated: 3,
      tokensUsed: 45_000,
    })
  })

  it('returns SUCCESS with defaults when payload is null', async () => {
    const r = await sessionEndHandler(makeCtx(null))
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('session-end')
    expect(r.context).toMatchObject({
      filesModified: [],
      commitsCreated: 0,
      tokensUsed: 0,
    })
  })

  it('returns SUCCESS with defaults when payload is empty object', async () => {
    const r = await sessionEndHandler(makeCtx({}))
    expect(r.exitCode).toBe(0)
    expect(r.context).toMatchObject({
      filesModified: [],
      commitsCreated: 0,
    })
  })

  // --- G.3 new persistence tests ---

  it('writes .anvil/session.json with the expected CostData shape', async () => {
    const r = await sessionEndHandler(
      makeCtx({
        tokensUsed: 1234,
        durationMs: 60_000,
        estimatedCostUsd: 0.1234,
        sessionStart: '2026-01-01T00:00:00.000Z',
      }),
    )
    expect(r.exitCode).toBe(0)

    const sessionPath = join(tmpDir, '.anvil', 'session.json')
    const raw = readFileSync(sessionPath, 'utf-8')
    const data = JSON.parse(raw) as Record<string, unknown>
    expect(data.tokensUsed).toBe(1234)
    expect(data.estimatedCostUsd).toBe(0.1234)
    expect(data.durationMs).toBe(60_000)
    expect(data.sessionStart).toBe('2026-01-01T00:00:00.000Z')
  })

  it('computes a fallback sessionStart when not provided in payload', async () => {
    const before = Date.now()
    await sessionEndHandler(
      makeCtx({
        tokensUsed: 500,
        durationMs: 30_000,
      }),
    )
    const after = Date.now()

    const sessionPath = join(tmpDir, '.anvil', 'session.json')
    const data = JSON.parse(readFileSync(sessionPath, 'utf-8')) as Record<
      string,
      unknown
    >
    const ts = new Date(data.sessionStart as string).getTime()
    // fallback = Date.now() - durationMs; check it's in a plausible range
    expect(ts).toBeGreaterThanOrEqual(before - 30_000 - 100)
    expect(ts).toBeLessThanOrEqual(after - 30_000 + 100)
  })

  it('does not throw and returns a valid result when cwd is not writable', async () => {
    // Use a path that doesn't exist at all as a sub-sub dir to force mkdir to fail
    // (we make the parent a file so mkdir recursive fails)
    const { writeFileSync } = await import('node:fs')
    const blockerPath = join(tmpDir, '.anvil')
    // Create .anvil as a file, not a directory — mkdir({ recursive: true }) will error
    writeFileSync(blockerPath, 'not-a-dir')

    const r = await sessionEndHandler(
      makeCtx({
        tokensUsed: 99,
        durationMs: 1_000,
      }),
    )
    // Must not throw; return value unchanged
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('session-end')
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/session-end — HookResult shape', () => {
  it('passes HookResult.parse() with full payload', async () => {
    const ctx = {
      kind: 'session-end' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { filesModified: ['a.ts'], commitsCreated: 1, tokensUsed: 1000 },
    }
    const r = await sessionEndHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const ctx = {
      kind: 'session-end' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await sessionEndHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
