import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TEARDOWN_TIMEOUT_MS,
  createCleanupRegistry,
  logDrainReport,
  pluginCleanup,
} from '../../../src/opencode-plugin/cleanup-registry.js'

describe('cleanup-registry — basics', () => {
  it('starts empty', () => {
    const r = createCleanupRegistry()
    expect(r.size).toBe(0)
  })

  it('register increments size; unregister handle removes the entry', () => {
    const r = createCleanupRegistry()
    const off = r.register(() => {})
    expect(r.size).toBe(1)
    off()
    expect(r.size).toBe(0)
  })

  it('unregister handle is idempotent', () => {
    const r = createCleanupRegistry()
    const off = r.register(() => {})
    off()
    expect(() => off()).not.toThrow()
    expect(r.size).toBe(0)
  })

  it('throws on non-function teardown', () => {
    const r = createCleanupRegistry()
    expect(() =>
      // @ts-expect-error — intentional contract probe
      r.register(42),
    ).toThrow(TypeError)
  })

  it('rejects non-positive default timeout', () => {
    expect(() => createCleanupRegistry(0)).toThrow(TypeError)
    expect(() => createCleanupRegistry(-100)).toThrow(TypeError)
    expect(() => createCleanupRegistry(1.5)).toThrow(TypeError)
  })

  it('exports DEFAULT_TEARDOWN_TIMEOUT_MS = 5_000', () => {
    expect(DEFAULT_TEARDOWN_TIMEOUT_MS).toBe(5_000)
  })

  it('ships a singleton `pluginCleanup`', () => {
    expect(pluginCleanup).toBeDefined()
    expect(typeof pluginCleanup.register).toBe('function')
  })
})

describe('cleanup-registry — LIFO ordering', () => {
  it('drain invokes teardowns in reverse registration order', async () => {
    const r = createCleanupRegistry()
    const order: string[] = []
    r.register(() => {
      order.push('first')
    })
    r.register(() => {
      order.push('second')
    })
    r.register(() => {
      order.push('third')
    })
    const report = await r.drain()
    expect(order).toEqual(['third', 'second', 'first'])
    expect(report.total).toBe(3)
    expect(report.ok).toBe(3)
    expect(report.errors).toBe(0)
    expect(report.timeouts).toBe(0)
  })

  it('drain empties the registry', async () => {
    const r = createCleanupRegistry()
    r.register(() => {})
    r.register(() => {})
    await r.drain()
    expect(r.size).toBe(0)
  })

  it('drain on an empty registry returns a zero report', async () => {
    const r = createCleanupRegistry()
    const report = await r.drain()
    expect(report.total).toBe(0)
    expect(report.outcomes).toEqual([])
  })

  it('teardowns registered DURING a drain are not run by that drain', async () => {
    const r = createCleanupRegistry()
    const seen: string[] = []
    r.register(() => {
      seen.push('outer')
      r.register(() => seen.push('re-entrant'))
    })
    const report = await r.drain()
    expect(seen).toEqual(['outer'])
    expect(report.total).toBe(1)
    // The re-entrant registration survives for a future drain.
    expect(r.size).toBe(1)
  })
})

describe('cleanup-registry — error isolation', () => {
  it('a throwing sync teardown does NOT prevent subsequent teardowns', async () => {
    const r = createCleanupRegistry()
    const order: string[] = []
    r.register(() => {
      order.push('a')
    })
    r.register(() => {
      order.push('b-throws')
      throw new Error('boom-b')
    })
    r.register(() => {
      order.push('c')
    })
    const report = await r.drain()
    // LIFO: c, b, a — all three ran despite b throwing.
    expect(order).toEqual(['c', 'b-throws', 'a'])
    expect(report.total).toBe(3)
    expect(report.ok).toBe(2)
    expect(report.errors).toBe(1)
    expect(report.timeouts).toBe(0)
    const errOutcome = report.outcomes.find((o) => o.outcome === 'error')
    expect(errOutcome).toBeDefined()
    expect((errOutcome?.error as Error).message).toBe('boom-b')
  })

  it('a rejecting async teardown is isolated', async () => {
    const r = createCleanupRegistry()
    const ran: string[] = []
    r.register(async () => {
      ran.push('a')
    })
    r.register(async () => {
      ran.push('b-reject')
      throw new Error('reject-b')
    })
    r.register(async () => {
      ran.push('c')
    })
    const report = await r.drain()
    expect(ran).toEqual(['c', 'b-reject', 'a'])
    expect(report.ok).toBe(2)
    expect(report.errors).toBe(1)
  })

  it('drain itself never rejects, even with all throwing teardowns', async () => {
    const r = createCleanupRegistry()
    r.register(() => {
      throw new Error('x')
    })
    r.register(() => {
      throw new Error('y')
    })
    await expect(r.drain()).resolves.toBeDefined()
  })
})

describe('cleanup-registry — per-handler timeout', () => {
  it('a hung teardown is force-aborted after the timeout', async () => {
    const r = createCleanupRegistry(50) // 50ms default
    const order: string[] = []
    r.register(() => {
      order.push('quick-1')
    })
    r.register(
      () =>
        new Promise<void>(() => {
          // never resolves — pure hang
          order.push('hung')
        }),
    )
    r.register(() => {
      order.push('quick-2')
    })
    const start = Date.now()
    const report = await r.drain()
    const elapsed = Date.now() - start
    // The hung teardown should NOT block other teardowns.
    expect(order).toContain('quick-1')
    expect(order).toContain('quick-2')
    expect(report.timeouts).toBe(1)
    expect(report.ok).toBe(2)
    // Drain finished promptly (well below a generous ceiling).
    expect(elapsed).toBeLessThan(1_000)
  })

  it('drain(timeoutMs) overrides the registry default', async () => {
    const r = createCleanupRegistry(10_000) // would normally wait 10s
    r.register(
      () =>
        new Promise<void>(() => {
          /* hang */
        }),
    )
    const start = Date.now()
    const report = await r.drain(25)
    const elapsed = Date.now() - start
    expect(report.timeouts).toBe(1)
    expect(elapsed).toBeLessThan(500)
  })
})

describe('cleanup-registry — plugin reload semantics', () => {
  it('full reload (drain) clears EVERY registered teardown', async () => {
    const r = createCleanupRegistry()
    const fired: number[] = []
    for (let i = 0; i < 7; i++) {
      r.register(() => {
        fired.push(i)
      })
    }
    expect(r.size).toBe(7)
    const report = await r.drain()
    expect(report.total).toBe(7)
    expect(r.size).toBe(0)
    // LIFO check across the bulk.
    expect(fired).toEqual([6, 5, 4, 3, 2, 1, 0])
  })

  it('a second drain after reload sees only newly-registered teardowns', async () => {
    const r = createCleanupRegistry()
    const fired: string[] = []
    r.register(() => fired.push('first-gen'))
    await r.drain()
    expect(fired).toEqual(['first-gen'])

    // Simulate plugin reload: new state registered.
    r.register(() => fired.push('second-gen'))
    const second = await r.drain()
    expect(second.total).toBe(1)
    expect(fired).toEqual(['first-gen', 'second-gen'])
  })
})

describe('cleanup-registry — Disposable contract', () => {
  it('exposes Symbol.asyncDispose', async () => {
    const r = createCleanupRegistry()
    const fired: number[] = []
    r.register(() => fired.push(1))
    r.register(() => fired.push(2))
    await r[Symbol.asyncDispose]()
    expect(fired).toEqual([2, 1])
    expect(r.size).toBe(0)
  })

  it('exposes a `.dispose()` alias for older runtimes', async () => {
    const r = createCleanupRegistry()
    const fired: string[] = []
    r.register(() => fired.push('a'))
    await r.dispose()
    expect(fired).toEqual(['a'])
  })
})

describe('cleanup-registry — logDrainReport', () => {
  it('is silent on a clean report', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    logDrainReport({
      total: 2,
      ok: 2,
      errors: 0,
      timeouts: 0,
      outcomes: [],
    })
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('writes a single line when errors/timeouts > 0', () => {
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    logDrainReport({
      total: 3,
      ok: 1,
      errors: 1,
      timeouts: 1,
      outcomes: [],
    })
    expect(spy).toHaveBeenCalledTimes(1)
    const msg = spy.mock.calls[0]?.[0]
    expect(String(msg)).toContain('cleanup_drain')
    expect(String(msg)).toContain('"errors":1')
    expect(String(msg)).toContain('"timeouts":1')
    spy.mockRestore()
  })
})
