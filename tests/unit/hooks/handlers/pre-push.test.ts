import { execSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { prePushHandler } from '../../../../src/hooks/handlers/pre-push.js'

vi.mock('node:child_process')

describe('hooks/handlers/pre-push', () => {
  const ctx = {
    kind: 'pre-push' as const,
    cwd: '/tmp/fake-project',
    config: buildDefaultConfig(),
    env: {},
    payload: null,
  }

  beforeEach(() => {
    vi.mocked(execSync).mockReset()
  })

  it('returns SUCCESS when tests pass', async () => {
    vi.mocked(execSync).mockReturnValue(Buffer.from(''))
    const r = await prePushHandler(ctx)
    expect(r.exitCode).toBe(0)
    expect(r.message).toMatch(/pass/i)
  })

  it('returns BLOCK when tests fail', async () => {
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('test suite failed')
    })
    const r = await prePushHandler(ctx)
    expect(r.exitCode).toBe(2)
    expect(r.message).toMatch(/aborted|fail/i)
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/pre-push — HookResult shape', () => {
  it('passes HookResult.parse() (test likely fails in /tmp, gets BLOCK)', async () => {
    const ctx = {
      kind: 'pre-push' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await prePushHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
