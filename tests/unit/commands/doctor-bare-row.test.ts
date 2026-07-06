import { spawnSync } from 'node:child_process'
/**
 * ROADMAP-doctor-bare — pushBareDiagnosticRow unit tests.
 *
 * Tests the pass/skip behavior without spawning real processes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushBareDiagnosticRow } from '../../../src/commands/cli/doctor.js'

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  // deriveProjectName (pulled in via getProjectScopedPath in doctor.ts) uses
  // execFile to read `git remote get-url origin`. Stub it so the mock surface
  // is complete; tests don't rely on its return value.
  execFile: vi.fn((_cmd, _args, _opts, cb) =>
    cb?.(new Error('mock: not a git repo'), '', ''),
  ),
}))

const mockSpawnSync = vi.mocked(spawnSync)

describe('pushBareDiagnosticRow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pushes pass row when claude is on PATH', () => {
    mockSpawnSync.mockReturnValue({
      status: 0,
      error: undefined,
      pid: 1234,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
    })
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushBareDiagnosticRow(checks)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Diagnostic: claude --bare available')
    expect(checks[0].status).toBe('pass')
    expect(checks[0].detail).toContain('claude --bare')
  })

  it('pushes skip row when claude is not on PATH', () => {
    mockSpawnSync.mockReturnValue({
      status: null,
      error: new Error('ENOENT'),
      pid: -1,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
    })
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushBareDiagnosticRow(checks)
    expect(checks).toHaveLength(1)
    expect(checks[0].name).toBe('Diagnostic: claude --bare available')
    expect(checks[0].status).toBe('skip')
    expect(checks[0].detail).toContain('not on PATH')
  })

  it('never pushes warn or fail status', () => {
    mockSpawnSync.mockReturnValue({
      status: 1,
      error: undefined,
      pid: 1234,
      output: [],
      stdout: Buffer.from(''),
      stderr: Buffer.from(''),
      signal: null,
    })
    const checks: Array<{ name: string; status: string; detail: string }> = []
    pushBareDiagnosticRow(checks)
    expect(checks[0].status).not.toBe('warn')
    expect(checks[0].status).not.toBe('fail')
  })
})
