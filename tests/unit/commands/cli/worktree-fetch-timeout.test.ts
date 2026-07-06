/**
 * ANV-0169 — Unit tests for the fetchRemoteBase timeout branch.
 *
 * The fetch step in `anvil worktree create` is now bounded by
 * `ANVIL_GIT_FETCH_TIMEOUT_MS` (default 30000 ms). When the timeout fires
 * Node's `spawnSync` returns `{ signal: 'SIGTERM' }` — that's the
 * discriminator for the distinct error message.
 *
 * Covers:
 *   - spawnSync receives a `timeout` option carrying the default 30000.
 *   - Env override (`ANVIL_GIT_FETCH_TIMEOUT_MS=...`) is plumbed through.
 *   - Non-numeric / negative / zero values fall back to the default.
 *   - signal === 'SIGTERM' surfaces the distinct timeout error message.
 *   - rev-parse is NOT called when the fetch times out.
 */

import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GIT_FETCH_TIMEOUT_MS,
  fetchRemoteBase,
  resolveFetchTimeoutMs,
} from '../../../../scripts/dev/worktree.js'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SpawnResult = {
  status: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

function okResult(stdout = ''): SpawnResult {
  return { status: 0, signal: null, stdout, stderr: '' }
}

function timeoutResult(): SpawnResult {
  // Node's contract for spawnSync timeout: status === null, signal === 'SIGTERM'.
  return { status: null, signal: 'SIGTERM', stdout: '', stderr: '' }
}

// ---------------------------------------------------------------------------
// resolveFetchTimeoutMs — env parsing
// ---------------------------------------------------------------------------

describe('resolveFetchTimeoutMs', () => {
  it('defaults to 30000 when env var is unset', () => {
    expect(resolveFetchTimeoutMs({})).toBe(30_000)
    expect(DEFAULT_GIT_FETCH_TIMEOUT_MS).toBe(30_000)
  })

  it('defaults when env var is empty string', () => {
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: '' })).toBe(
      30_000,
    )
  })

  it('parses positive integer values', () => {
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: '100' })).toBe(
      100,
    )
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: '60000' })).toBe(
      60_000,
    )
  })

  it('rejects non-numeric values by falling back to the default', () => {
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: 'abc' })).toBe(
      30_000,
    )
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: 'NaN' })).toBe(
      30_000,
    )
  })

  it('rejects negative and zero values by falling back to the default', () => {
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: '-1' })).toBe(
      30_000,
    )
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: '-1000' })).toBe(
      30_000,
    )
    expect(resolveFetchTimeoutMs({ ANVIL_GIT_FETCH_TIMEOUT_MS: '0' })).toBe(
      30_000,
    )
  })
})

// ---------------------------------------------------------------------------
// fetchRemoteBase — timeout branch
// ---------------------------------------------------------------------------

describe('fetchRemoteBase — timeout branch', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>
  const ENV_KEY = 'ANVIL_GIT_FETCH_TIMEOUT_MS'
  const originalEnvValue = process.env[ENV_KEY]

  function clearEnv(): void {
    delete process.env[ENV_KEY]
  }

  function restoreEnv(): void {
    if (originalEnvValue === undefined) {
      clearEnv()
    } else {
      process.env[ENV_KEY] = originalEnvValue
    }
  }

  beforeEach(() => {
    vi.mocked(spawnSync).mockReset()
    clearEnv()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number | string | null) => {
        throw new Error(`process.exit(${_code ?? ''})`)
      })
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    exitSpy.mockRestore()
    restoreEnv()
  })

  it('passes the default timeout (30000 ms) to spawnSync when env unset', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult() as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(okResult('abc123') as ReturnType<typeof spawnSync>)

    fetchRemoteBase('main', '/repo')

    expect(vi.mocked(spawnSync)).toHaveBeenNthCalledWith(
      1,
      'git',
      ['fetch', 'origin', 'main'],
      expect.objectContaining({
        cwd: '/repo',
        shell: false,
        timeout: 30_000,
      }),
    )
  })

  it('passes the env-configured timeout to spawnSync', () => {
    process.env.ANVIL_GIT_FETCH_TIMEOUT_MS = '5000'
    vi.mocked(spawnSync)
      .mockReturnValueOnce(okResult() as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(okResult('abc123') as ReturnType<typeof spawnSync>)

    fetchRemoteBase('main', '/repo')

    expect(vi.mocked(spawnSync)).toHaveBeenNthCalledWith(
      1,
      'git',
      ['fetch', 'origin', 'main'],
      expect.objectContaining({ timeout: 5_000 }),
    )
  })

  it('emits the distinct timeout error when spawnSync returns signal=SIGTERM', () => {
    vi.mocked(spawnSync).mockReturnValueOnce(
      timeoutResult() as ReturnType<typeof spawnSync>,
    )

    expect(() => fetchRemoteBase('main', '/repo')).toThrow('process.exit(1)')

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'git fetch origin/main timed out after 30000 ms — pass --no-fetch or set ANVIL_GIT_FETCH_TIMEOUT_MS=<higher>',
      ),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
    // The distinct timeout error must NOT be the generic "fetch failed" message.
    expect(stderrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot create worktree: fetch origin/main failed',
      ),
    )
    // rev-parse must NOT be called when the fetch times out.
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(1)
  })

  it('reflects the configured timeout value in the timeout error message', () => {
    process.env.ANVIL_GIT_FETCH_TIMEOUT_MS = '100'
    vi.mocked(spawnSync).mockReturnValueOnce(
      timeoutResult() as ReturnType<typeof spawnSync>,
    )

    expect(() => fetchRemoteBase('release/v0.13.5', '/repo')).toThrow(
      'process.exit(1)',
    )

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'git fetch origin/release/v0.13.5 timed out after 100 ms',
      ),
    )
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'pass --no-fetch or set ANVIL_GIT_FETCH_TIMEOUT_MS=<higher>',
      ),
    )
  })

  it('non-numeric env value falls back to default and prints 30000 in the message', () => {
    process.env.ANVIL_GIT_FETCH_TIMEOUT_MS = 'not-a-number'
    vi.mocked(spawnSync).mockReturnValueOnce(
      timeoutResult() as ReturnType<typeof spawnSync>,
    )

    expect(() => fetchRemoteBase('main', '/repo')).toThrow('process.exit(1)')

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('git fetch origin/main timed out after 30000 ms'),
    )
  })

  it('non-SIGTERM failure (status 128, no signal) still hits the generic error path', () => {
    vi.mocked(spawnSync).mockReturnValueOnce({
      status: 128,
      signal: null,
      stdout: '',
      stderr: '',
    } as ReturnType<typeof spawnSync>)

    expect(() => fetchRemoteBase('main', '/repo')).toThrow('process.exit(1)')

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot create worktree: fetch origin/main failed — pass --no-fetch to use the local ref',
      ),
    )
    expect(stderrSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('timed out'),
    )
  })
})
