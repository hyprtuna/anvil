/**
 * ANV-0044 — Bun-runtime dispatcher coverage.
 *
 * Verifies that the OC plugin dispatcher's invokeHook() passes process.execPath
 * verbatim as the spawn command. When Anvil runs under OpenCode (which uses Bun),
 * process.execPath ends with "bun" rather than "node". The dispatcher must honour
 * whatever runtime is active rather than hard-coding a path.
 *
 * Strategy: mock node:child_process.spawn to intercept invocation args, then
 * temporarily override process.execPath via Object.defineProperty and confirm
 * the correct exec path flows through to spawn().
 *
 * These are pure unit tests — no real Bun binary is required.
 */

import { EventEmitter } from 'node:events'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// ─── Mock node:child_process BEFORE importing dispatcher ─────────────────────
// vi.mock is hoisted to the top of the module by Vitest, so the mock is in
// place when dispatcher.ts imports { spawn } from 'node:child_process'.
// The factory must NOT reference outer variables (hoisting restriction).

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

// Import AFTER mock registration so the dispatcher picks up the mock.
import { spawn } from 'node:child_process'
import { clearDiscoveryCache } from '../../../src/opencode-plugin/hooks/discovery.js'
import {
  clearManifestCache,
  dispatchOcBefore,
} from '../../../src/opencode-plugin/hooks/dispatcher.js'

// Typed reference to the vi.fn() installed by the mock factory above.
const spawnMock = vi.mocked(spawn)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a fake child process object that emits 'close' with exitCode 0 and
 * returns a valid HookResult JSON on stdout.  The fake child satisfies the
 * event-emitter interface that dispatcher.ts consumes.
 */
function makeFakeChild(exitCode = 0, stdoutPayload = '{"exitCode":0}') {
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const stdin = {
    write: vi.fn((_data: string, _enc: string) => true),
    end: vi.fn(),
  }
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    stdin: typeof stdin
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = stdout
  child.stderr = stderr
  child.stdin = stdin
  child.kill = vi.fn()

  // Emit data + close asynchronously so the dispatcher's Promise resolves
  setImmediate(() => {
    stdout.emit('data', Buffer.from(stdoutPayload))
    child.emit('close', exitCode)
  })

  return child
}

/**
 * Write a minimal .cjs hook file so resolveHookFiles() finds it.
 */
async function writeHook(
  dir: string,
  kind: string,
  name: string,
): Promise<string> {
  const hookDir = join(dir, '.anvil', 'hooks', kind)
  await mkdir(hookDir, { recursive: true })
  const path = join(hookDir, name)
  // Content does not matter — spawn is mocked; the file just needs to exist
  await writeFile(path, '/* placeholder */', 'utf-8')
  return path
}

function makeBeforeArgs(cwd: string, anvilRoot: string) {
  return {
    input: { tool: 'bash', sessionID: 'sess-bun', callID: 'call-bun' },
    output: { args: { command: 'echo hello' } },
    cwd,
    anvilRoot,
  }
}

// ─── Test state ───────────────────────────────────────────────────────────────

let tmpDir: string
let originalExecPath: string

beforeEach(async () => {
  tmpDir = createTestTmpDir('bun-dispatch')
  process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = join(tmpDir, 'global-hooks')
  clearDiscoveryCache()
  clearManifestCache()
  spawnMock.mockClear()
  originalExecPath = process.execPath
})

afterEach(async () => {
  // Restore process.execPath to original value
  Object.defineProperty(process, 'execPath', {
    value: originalExecPath,
    writable: true,
    configurable: true,
  })
  process.env.ANVIL_GLOBAL_HOOKS_OVERRIDE = undefined
  clearDiscoveryCache()
  clearManifestCache()
  await rm(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('OC dispatcher — Bun-runtime spawn argument fidelity', () => {
  /**
   * Test 1: when process.execPath ends with "bun", spawn() is called with
   * that exact path as its first argument (no hard-coded "/usr/bin/node"
   * substitution).
   */
  it('1. uses bun execPath as spawn command when process.execPath ends with "bun"', async () => {
    const fakeBunPath = '/usr/bin/bun'
    Object.defineProperty(process, 'execPath', {
      value: fakeBunPath,
      writable: true,
      configurable: true,
    })

    spawnMock.mockImplementation(() => makeFakeChild(0))

    await writeHook(tmpDir, 'pre-tool-use', 'test-hook.cjs')
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await dispatchOcBefore(args)

    expect(spawnMock).toHaveBeenCalled()
    const [spawnCmd] = spawnMock.mock.calls[0] as [string, ...unknown[]]
    expect(spawnCmd).toBe(fakeBunPath)
    expect(spawnCmd.endsWith('bun')).toBe(true)
  })

  /**
   * Test 2: when process.execPath ends with "node" (standard Node runtime),
   * spawn() is called with that exact node path.
   */
  it('2. uses node execPath as spawn command when process.execPath ends with "node"', async () => {
    const fakeNodePath = '/usr/local/bin/node'
    Object.defineProperty(process, 'execPath', {
      value: fakeNodePath,
      writable: true,
      configurable: true,
    })

    spawnMock.mockImplementation(() => makeFakeChild(0))

    await writeHook(tmpDir, 'pre-tool-use', 'test-hook.cjs')
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await dispatchOcBefore(args)

    expect(spawnMock).toHaveBeenCalled()
    const [spawnCmd] = spawnMock.mock.calls[0] as [string, ...unknown[]]
    expect(spawnCmd).toBe(fakeNodePath)
    expect(spawnCmd.endsWith('node')).toBe(true)
  })

  /**
   * Test 3: the hook file path is passed as the first positional argument to
   * spawn — this is consistent across both Node and Bun runtimes.
   */
  it('3. hook file path is always spawn argv[0] regardless of runtime', async () => {
    // Test with bun
    Object.defineProperty(process, 'execPath', {
      value: '/usr/bin/bun',
      writable: true,
      configurable: true,
    })

    spawnMock.mockImplementation(() => makeFakeChild(0))

    const hookPath = await writeHook(tmpDir, 'pre-tool-use', 'path-check.cjs')
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await dispatchOcBefore(args)

    expect(spawnMock).toHaveBeenCalled()
    const [, spawnArgv] = spawnMock.mock.calls[0] as [
      string,
      string[],
      ...unknown[],
    ]
    expect(spawnArgv[0]).toBe(hookPath)
  })

  /**
   * Test 4: bun-flavored spawn still gets stdio: ['pipe','pipe','pipe'] — the
   * safe-env isolation must not be bypassed under Bun.
   */
  it('4. stdio pipes are preserved under bun execPath (safe-env isolation)', async () => {
    Object.defineProperty(process, 'execPath', {
      value: '/home/user/.bun/bin/bun',
      writable: true,
      configurable: true,
    })

    spawnMock.mockImplementation(() => makeFakeChild(0))

    await writeHook(tmpDir, 'pre-tool-use', 'stdio-check.cjs')
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await dispatchOcBefore(args)

    expect(spawnMock).toHaveBeenCalled()
    const [, , spawnOpts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { stdio: unknown; env: unknown },
    ]
    expect(spawnOpts.stdio).toEqual(['pipe', 'pipe', 'pipe'])
  })

  /**
   * Test 5: dispatch result is still correct (no throw for exitCode 0) when
   * running under a mocked bun execPath — ensures the rest of the pipeline
   * is not disrupted by a non-node execPath.
   */
  it('5. dispatchOcBefore resolves successfully under bun execPath', async () => {
    Object.defineProperty(process, 'execPath', {
      value: '/usr/bin/bun',
      writable: true,
      configurable: true,
    })

    spawnMock.mockImplementation(() => makeFakeChild(0, '{"exitCode":0}'))

    await writeHook(tmpDir, 'pre-tool-use', 'bun-pass.cjs')
    const args = makeBeforeArgs(tmpDir, tmpDir)
    await expect(dispatchOcBefore(args)).resolves.toBeUndefined()
  })

  /**
   * Test 6: OcHookBlockedError is still raised under bun execPath when hook
   * returns exitCode 2 — error policy is runtime-agnostic.
   */
  it('6. OcHookBlockedError thrown under bun execPath when hook returns exitCode 2', async () => {
    Object.defineProperty(process, 'execPath', {
      value: '/usr/bin/bun',
      writable: true,
      configurable: true,
    })

    spawnMock.mockImplementation(() =>
      makeFakeChild(0, '{"exitCode":2,"message":"bun-blocked"}'),
    )

    await writeHook(tmpDir, 'pre-tool-use', 'bun-block.cjs')
    const args = makeBeforeArgs(tmpDir, tmpDir)
    const { OcHookBlockedError } = await import(
      '../../../src/opencode-plugin/hooks/dispatcher.js'
    )
    await expect(dispatchOcBefore(args)).rejects.toThrow(OcHookBlockedError)
    await expect(dispatchOcBefore(args)).rejects.toThrow('bun-blocked')
  })
})
