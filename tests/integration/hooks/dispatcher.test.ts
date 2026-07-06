/**
 * Phase G — Integration: dispatcher async + sync latency regression
 *
 * Verifies that dispatch latency ≈ sync handler time only when
 * async handlers are also registered (async runs in background).
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookResult } from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'

const baseCtx = () => ({
  kind: 'pre-commit' as const,
  cwd: '/tmp/test',
  config: buildDefaultConfig(),
  env: {},
  payload: null,
})

describe('integration/hooks/dispatcher — async+sync latency budget', () => {
  it('dispatch latency ≈ sync handler time only; async runs in background', async () => {
    const reg = new HookRegistry()
    const SYNC_DELAY = 30 // ms
    const ASYNC_DELAY = 150 // ms — well above sync; dispatch should return before this

    let asyncHandlerFinished = false

    // Sync handler: ~30ms
    reg.register(
      'sync-handler',
      'pre-commit',
      async (): Promise<HookResult> => {
        await new Promise((resolve) => setTimeout(resolve, SYNC_DELAY))
        return { exitCode: 0, message: 'sync done' }
      },
    )

    // Async handler: ~150ms but should NOT block dispatch
    reg.register(
      'async-handler',
      'pre-commit',
      async (): Promise<HookResult> => {
        await new Promise((resolve) => setTimeout(resolve, ASYNC_DELAY))
        asyncHandlerFinished = true
        return { exitCode: 0 }
      },
      { async: true } as Parameters<HookRegistry['register']>[3],
    )

    const start = performance.now()
    const result = await dispatch(reg, baseCtx())
    const elapsed = performance.now() - start

    // Dispatch should have taken roughly SYNC_DELAY, not SYNC_DELAY + ASYNC_DELAY
    // Allow 3x for CI jitter, but must be under ASYNC_DELAY
    expect(elapsed).toBeLessThan(ASYNC_DELAY)

    // Sync handler message is in result
    expect(result.messages.some((m) => m.includes('sync done'))).toBe(true)

    // Async handler is still running
    expect(asyncHandlerFinished).toBe(false)

    // Wait for async to finish
    await new Promise((resolve) => setTimeout(resolve, ASYNC_DELAY + 50))
    expect(asyncHandlerFinished).toBe(true)
  })

  it('sync-only regression: all handlers blocking → dispatch waits for all', async () => {
    const reg = new HookRegistry()
    const DELAY_A = 20
    const DELAY_B = 20
    const order: string[] = []

    reg.register('sync-a', 'pre-commit', async (): Promise<HookResult> => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_A))
      order.push('a')
      return { exitCode: 0, message: 'a' }
    })

    reg.register('sync-b', 'pre-commit', async (): Promise<HookResult> => {
      await new Promise((resolve) => setTimeout(resolve, DELAY_B))
      order.push('b')
      return { exitCode: 0, message: 'b' }
    })

    const result = await dispatch(reg, baseCtx())

    // Both must have completed
    expect(order).toEqual(['a', 'b'])
    expect(result.messages.some((m) => m.includes('a'))).toBe(true)
    expect(result.messages.some((m) => m.includes('b'))).toBe(true)
  })

  it('async exit code does not pollute dispatch result exitCode', async () => {
    const reg = new HookRegistry()

    reg.register(
      'async-block',
      'pre-commit',
      async (): Promise<HookResult> => ({
        exitCode: 2,
        message: 'async block',
      }),
      { async: true } as Parameters<HookRegistry['register']>[3],
    )

    reg.register(
      'sync-success',
      'pre-commit',
      async (): Promise<HookResult> => ({ exitCode: 0, message: 'sync ok' }),
    )

    const result = await dispatch(reg, baseCtx())
    // Only sync result contributes to exitCode
    expect(result.exitCode).toBe(0)
    expect(result.messages.some((m) => m.includes('sync ok'))).toBe(true)
    // Async block message should NOT appear in result.messages
    expect(result.messages.some((m) => m.includes('async block'))).toBe(false)

    // Let async settle
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
})
