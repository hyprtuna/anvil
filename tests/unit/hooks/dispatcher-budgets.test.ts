import { describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookContext, HookHandler } from '../../../src/core/types.js'
import {
  DEFAULT_ASYNC_BUDGET_MS,
  DEFAULT_BLOCKING_BUDGET_MS,
  dispatch,
} from '../../../src/hooks/dispatcher.js'

function ctx(kind: HookContext['kind'] = 'user-prompt-submit'): HookContext {
  return {
    kind,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {},
    payload: 'x',
  }
}

function slow(ms: number): HookHandler {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    return { exitCode: 0 }
  }
}

describe('hooks/dispatcher — perf budgets (T4.4)', () => {
  it('exposes sane defaults (blocking 200ms, async 30s)', () => {
    expect(DEFAULT_BLOCKING_BUDGET_MS).toBe(200)
    expect(DEFAULT_ASYNC_BUDGET_MS).toBe(30_000)
  })

  it('flags a blocking hook that exceeds budget via the trace', async () => {
    const reg = new HookRegistry()
    reg.register('lazy', 'user-prompt-submit', slow(30))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await dispatch(reg, ctx('user-prompt-submit'), {
        budgets: { blockingMs: 10 },
      })
      expect(result.trace).toHaveLength(1)
      expect(result.trace[0].budgetExceeded).toBe(true)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })

  it('does not flag a hook that stays under budget', async () => {
    const reg = new HookRegistry()
    reg.register('fast', 'user-prompt-submit', slow(1))
    const result = await dispatch(reg, ctx('user-prompt-submit'), {
      budgets: { blockingMs: 500 },
    })
    expect(result.trace[0].budgetExceeded).toBeUndefined()
  })

  it('applies async budget for non-blocking stages', async () => {
    const reg = new HookRegistry()
    reg.register('maybe-slow', 'post-edit', slow(30))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const result = await dispatch(reg, ctx('post-edit'), {
        budgets: { asyncMs: 10, blockingMs: 500 },
      })
      expect(result.trace[0].budgetExceeded).toBe(true)
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('hooks/dispatcher — trace (T4.5)', () => {
  it('produces one trace entry per executed hook in dispatch order', async () => {
    const reg = new HookRegistry()
    reg.register('first', 'user-prompt-submit', async () => ({ exitCode: 0 }), {
      priority: 5,
    })
    reg.register('second', 'user-prompt-submit', async () => ({ exitCode: 0 }))
    const result = await dispatch(reg, ctx())
    expect(result.trace).toHaveLength(2)
    expect(result.trace.map((t) => t.hookName)).toEqual(['first', 'second'])
  })

  it('captures exitCode + elapsedMs + priority per hook', async () => {
    const reg = new HookRegistry()
    reg.register(
      'warn',
      'user-prompt-submit',
      async () => ({ exitCode: 1, message: 'heads up' }),
      { priority: 3 },
    )
    const result = await dispatch(reg, ctx())
    expect(result.trace[0].exitCode).toBe(1)
    expect(result.trace[0].priority).toBe(3)
    expect(typeof result.trace[0].elapsedMs).toBe('number')
    expect(result.trace[0].elapsedMs).toBeGreaterThanOrEqual(0)
    expect(result.trace[0].message).toBe('heads up')
  })

  it('records a handler that threw as exitCode 2 with message', async () => {
    const reg = new HookRegistry()
    reg.register('boom', 'user-prompt-submit', async () => {
      throw new Error('kaboom')
    })
    const result = await dispatch(reg, ctx())
    expect(result.trace[0].exitCode).toBe(2)
    expect(result.trace[0].message).toContain('kaboom')
  })

  it('trace honors stopOnBlock — only entries that ran are recorded', async () => {
    const reg = new HookRegistry()
    reg.register('blocker', 'user-prompt-submit', async () => ({
      exitCode: 2,
      message: 'no',
    }))
    reg.register('never', 'user-prompt-submit', async () => ({ exitCode: 0 }))
    const result = await dispatch(reg, ctx(), { stopOnBlock: true })
    expect(result.trace).toHaveLength(1)
    expect(result.trace[0].hookName).toBe('blocker')
  })
})
