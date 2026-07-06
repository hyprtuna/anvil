import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { postTestRunHandler } from '../../../../src/hooks/handlers/post-test-run.js'

describe('hooks/handlers/post-test-run', () => {
  it('returns SUCCESS with test summary when payload is provided', async () => {
    const r = await postTestRunHandler({
      kind: 'post-test-run',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { passed: 42, failed: 1, summary: '42 passed, 1 failed' },
    })
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('42 passed, 1 failed')
    expect(r.context).toMatchObject({ passed: 42, failed: 1 })
  })

  it('returns SUCCESS with defaults when payload is null', async () => {
    const r = await postTestRunHandler({
      kind: 'post-test-run',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    })
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('0 passed, 0 failed')
    expect(r.context).toMatchObject({ passed: 0, failed: 0 })
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/post-test-run — HookResult shape', () => {
  it('passes HookResult.parse() with full payload', async () => {
    const ctx = {
      kind: 'post-test-run' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { passed: 5, failed: 0 },
    }
    const r = await postTestRunHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const ctx = {
      kind: 'post-test-run' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await postTestRunHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
