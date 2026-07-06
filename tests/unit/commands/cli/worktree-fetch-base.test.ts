/**
 * ANV-0164 — Unit tests for fetchRemoteBase().
 *
 * Mocks spawnSync so no real git calls are made. Verifies:
 *   - Correct fetch args (shell: false, no injection)
 *   - Correct rev-parse args
 *   - SHA is returned on success
 *   - process.exit(1) is called on fetch failure
 */

import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchRemoteBase } from '../../../../scripts/dev/worktree.js'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SpawnResult = {
  status: number
  stdout: string
  stderr: string
}

function makeResult(status: number, stdout = '', stderr = ''): SpawnResult {
  return { status, stdout, stderr }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchRemoteBase', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.mocked(spawnSync).mockReset()
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number | string) => {
        throw new Error(`process.exit(${_code ?? ''})`)
      })
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    exitSpy.mockRestore()
  })

  it('calls git fetch with correct args (shell: false) for main', () => {
    const remoteSha = 'abc123def456abc123def456abc123def456abc123'
    vi.mocked(spawnSync)
      .mockReturnValueOnce(makeResult(0) as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(
        makeResult(0, remoteSha) as ReturnType<typeof spawnSync>,
      )

    const result = fetchRemoteBase('main', '/repo')

    expect(vi.mocked(spawnSync)).toHaveBeenNthCalledWith(
      1,
      'git',
      ['fetch', 'origin', 'main'],
      expect.objectContaining({ shell: false, cwd: '/repo' }),
    )
    expect(vi.mocked(spawnSync)).toHaveBeenNthCalledWith(
      2,
      'git',
      ['rev-parse', 'origin/main'],
      expect.objectContaining({ shell: false, cwd: '/repo' }),
    )
    expect(result).toBe(remoteSha)
  })

  it('calls git fetch with correct args for a release branch', () => {
    const remoteSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    vi.mocked(spawnSync)
      .mockReturnValueOnce(makeResult(0) as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(
        makeResult(0, remoteSha) as ReturnType<typeof spawnSync>,
      )

    const result = fetchRemoteBase('release/v0.13.5', '/repo')

    expect(vi.mocked(spawnSync)).toHaveBeenNthCalledWith(
      1,
      'git',
      ['fetch', 'origin', 'release/v0.13.5'],
      expect.objectContaining({ shell: false }),
    )
    expect(result).toBe(remoteSha)
  })

  it('aborts with clear error message when fetch fails (non-zero exit)', () => {
    vi.mocked(spawnSync).mockReturnValueOnce(
      makeResult(128) as ReturnType<typeof spawnSync>,
    )

    expect(() => fetchRemoteBase('main', '/repo')).toThrow('process.exit(1)')

    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot create worktree: fetch origin/main failed — pass --no-fetch to use the local ref',
      ),
    )
    expect(exitSpy).toHaveBeenCalledWith(1)
    // rev-parse must NOT be called when fetch fails
    expect(vi.mocked(spawnSync)).toHaveBeenCalledTimes(1)
  })

  it('aborts if rev-parse fails after a successful fetch', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(makeResult(0) as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(makeResult(128) as ReturnType<typeof spawnSync>)

    expect(() => fetchRemoteBase('main', '/repo')).toThrow('process.exit(1)')
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('returns trimmed SHA (no trailing newline)', () => {
    const sha = 'cafebabecafebabecafebabecafebabecafebabe'
    vi.mocked(spawnSync)
      .mockReturnValueOnce(makeResult(0) as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce(
        makeResult(0, `${sha}\n`) as ReturnType<typeof spawnSync>,
      )

    const result = fetchRemoteBase('main', '/repo')
    expect(result).toBe(sha)
  })
})
