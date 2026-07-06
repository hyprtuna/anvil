/**
 * Lightweight benchmark snapshot — Plan 39 Phase H.
 *
 * Asserts that for N=10 edit events in a session, the format command is
 * invoked exactly ONCE at Stop time, not once per edit.
 *
 * Also captures a basic timing snapshot (not a hard threshold assertion;
 * informational only).
 */

import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import type { HookKind } from '../../../src/core/types.js'
import {
  accumStateFilePath,
  loadAccumState,
  postEditAccumulatorHandler,
  resetAccumCache,
} from '../../../src/hooks/handlers/post-edit-accumulator.js'
import {
  resetSpawnFn,
  setSpawnFn,
  stopHandler,
} from '../../../src/hooks/handlers/stop.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SESSION = 'perf-test-session-n10'

function makeEditCtx(sessionId: string, filePath: string) {
  return {
    kind: 'post-tool-use' as HookKind,
    cwd: tmpdir(),
    config: buildDefaultConfig(),
    env: {},
    payload: {
      session_id: sessionId,
      tool_name: 'Edit',
      tool_input: { file_path: filePath },
    },
  }
}

function makeStopCtx(sessionId: string) {
  return {
    kind: 'stop' as HookKind,
    cwd: tmpdir(),
    config: buildDefaultConfig(),
    env: {},
    payload: { session_id: sessionId },
  }
}

function cleanAccum() {
  try {
    rmSync(accumStateFilePath(SESSION), { force: true })
  } catch {
    // ignore
  }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  resetAccumCache()
  cleanAccum()
  resetSpawnFn()
})

afterEach(() => {
  resetAccumCache()
  cleanAccum()
  resetSpawnFn()
})

// ─── Perf snapshot tests ──────────────────────────────────────────────────────

describe('post-edit-batch perf: N=10 edits → 1 format invocation at Stop', () => {
  it('format command is invoked once (at Stop), not 10 times', async () => {
    const N = 10
    const files = Array.from({ length: N }, (_, i) => `/src/file${i}.ts`)

    // ── Step 1: Simulate N edit PostToolUse events ────────────────────────────
    const t0 = performance.now()

    for (const file of files) {
      await postEditAccumulatorHandler(makeEditCtx(SESSION, file))
    }

    const accumTime = performance.now() - t0

    // ── Step 2: Verify accumulator has all N paths ────────────────────────────
    const paths = await loadAccumState(SESSION)
    expect(paths.size).toBe(N)

    // ── Step 3: Simulate Stop — batch format runs once ────────────────────────
    let formatInvocations = 0
    let tscInvocations = 0

    setSpawnFn((_cmd: string, args?: readonly string[]) => {
      const argList = Array.from(args ?? [])
      if (argList.includes('biome')) formatInvocations++
      if (argList.includes('tsc')) tscInvocations++
      return {
        status: 0,
        error: undefined,
        stdout: '',
        stderr: '',
        pid: 1,
        signal: null,
        output: [null, null, null] as [null, null, null],
      }
    })

    const tStop0 = performance.now()
    await stopHandler(makeStopCtx(SESSION))
    const stopTime = performance.now() - tStop0

    // ── Assertions ────────────────────────────────────────────────────────────

    // Format invoked exactly once regardless of how many edits occurred
    expect(formatInvocations).toBe(1)

    // tsc invoked exactly once (all files are .ts)
    expect(tscInvocations).toBe(1)

    // ── Timing snapshot (informational — not a hard threshold) ───────────────
    console.log(
      `[perf-snapshot] N=${N} edits: accumulate=${accumTime.toFixed(1)}ms, stop-batch-overhead=${stopTime.toFixed(1)}ms`,
    )
    console.log(
      `[perf-snapshot] format invocations: ${formatInvocations} (expected 1 regardless of N)`,
    )

    // Soft timing assertion: accumulation of 10 edits should complete in <1s
    expect(accumTime).toBeLessThan(1000)
  })

  it('no spawn calls at all during the 10 PostToolUse (accumulate) phase', async () => {
    const N = 10
    let spawnCallsDuringAccumulate = 0

    setSpawnFn(() => {
      spawnCallsDuringAccumulate++
      return {
        status: 0,
        error: undefined,
        stdout: '',
        stderr: '',
        pid: 1,
        signal: null,
        output: [null, null, null] as [null, null, null],
      }
    })

    // Simulate N edit events
    for (let i = 0; i < N; i++) {
      await postEditAccumulatorHandler(makeEditCtx(SESSION, `/src/perf${i}.ts`))
    }

    // During accumulation: ZERO spawns (the whole point of batching)
    expect(spawnCallsDuringAccumulate).toBe(0)
  })

  it('duplicate edits to same file across N calls still yield 1 format invocation', async () => {
    const SAME_FILE = '/src/hotspot.ts'
    const N = 10

    // Edit the same file N times (hot path — e.g. iterative edits in same session)
    for (let i = 0; i < N; i++) {
      await postEditAccumulatorHandler(makeEditCtx(SESSION, SAME_FILE))
    }

    // Dedup: only 1 unique path
    const paths = await loadAccumState(SESSION)
    expect(paths.size).toBe(1)

    let formatInvocations = 0
    setSpawnFn((_cmd: string, args?: readonly string[]) => {
      if (Array.from(args ?? []).includes('biome')) formatInvocations++
      return {
        status: 0,
        error: undefined,
        stdout: '',
        stderr: '',
        pid: 1,
        signal: null,
        output: [null, null, null] as [null, null, null],
      }
    })

    await stopHandler(makeStopCtx(SESSION))

    // Still only 1 format invocation
    expect(formatInvocations).toBe(1)
  })
})
