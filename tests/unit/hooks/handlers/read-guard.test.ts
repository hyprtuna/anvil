import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import {
  getTotalReads,
  readGuardHandler,
  resetReadCounts,
} from '../../../../src/hooks/handlers/read-guard.js'

function makeCtx(payload: unknown) {
  return {
    kind: 'read-guard' as const,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

describe('hooks/handlers/read-guard', () => {
  beforeEach(() => {
    resetReadCounts()
  })

  it('returns OK under threshold', async () => {
    const r = await readGuardHandler(makeCtx({ filePath: 'src/index.ts' }))
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('read #1')
    expect(getTotalReads()).toBe(1)
  })

  it('returns warning at threshold', async () => {
    // Run 49 reads to get just under threshold
    for (let i = 0; i < 49; i++) {
      await readGuardHandler(makeCtx({ filePath: `src/file-${i}.ts` }))
    }
    expect(getTotalReads()).toBe(49)

    // The 50th read should trigger a warning
    const r = await readGuardHandler(makeCtx({ filePath: 'src/trigger.ts' }))
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('WARNING')
    expect(r.context).toMatchObject({ severity: 'warning', totalReads: 50 })
  })

  it('returns critical at critical threshold', async () => {
    // Run 99 reads
    for (let i = 0; i < 99; i++) {
      await readGuardHandler(makeCtx({ filePath: `src/file-${i % 10}.ts` }))
    }

    // The 100th read should trigger critical
    const r = await readGuardHandler(makeCtx({ filePath: 'src/critical.ts' }))
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('CRITICAL')
    expect(r.context).toMatchObject({ severity: 'critical', totalReads: 100 })
  })

  it('tracks top files in context', async () => {
    // Read same file 5 times
    for (let i = 0; i < 5; i++) {
      await readGuardHandler(makeCtx({ filePath: 'src/hot-file.ts' }))
    }
    const r = await readGuardHandler(makeCtx({ filePath: 'src/other.ts' }))
    const topFiles = (r.context as Record<string, unknown>).topFiles as Array<{
      path: string
      count: number
    }>
    expect(topFiles[0]).toMatchObject({ path: 'src/hot-file.ts', count: 5 })
  })

  it('handles null payload gracefully', async () => {
    const r = await readGuardHandler(makeCtx(null))
    expect(r.exitCode).toBe(0)
    expect(getTotalReads()).toBe(0)
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/read-guard — HookResult shape', () => {
  it('passes HookResult.parse() for all return paths', async () => {
    const ctx = {
      kind: 'read-guard' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { filePath: '/tmp/some-file.ts' },
    }
    const r = await readGuardHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const ctx = {
      kind: 'read-guard' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await readGuardHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
