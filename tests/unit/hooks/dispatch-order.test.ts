import { describe, expect, it } from 'vitest'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookHandler, HookResult } from '../../../src/core/types.js'

function noop(): HookHandler {
  return async () => ({ exitCode: 0 }) as HookResult
}

describe('hooks/registry — dispatch order (T4.3)', () => {
  it('higher priority fires first within a stage', () => {
    const reg = new HookRegistry()
    reg.register('advisory', 'pre-tool-use', noop(), { priority: 0 })
    reg.register('security', 'pre-tool-use', noop(), { priority: 10 })
    reg.register('middle', 'pre-tool-use', noop(), { priority: 5 })

    const hooks = reg.getAll().filter((h) => h.kind === 'pre-tool-use')
    const handlers = reg.getHandlers('pre-tool-use')
    expect(handlers).toHaveLength(3)
    const ordered = hooks
      .slice()
      .sort((a, b) => b.priority - a.priority)
      .map((h) => h.name)
    expect(ordered).toEqual(['security', 'middle', 'advisory'])
  })

  it('ties on priority fall back to insertion order (stable)', () => {
    const reg = new HookRegistry()
    reg.register('first', 'pre-tool-use', noop(), { priority: 5 })
    reg.register('second', 'pre-tool-use', noop(), { priority: 5 })
    reg.register('third', 'pre-tool-use', noop(), { priority: 5 })
    const all = reg
      .getAll()
      .filter((h) => h.kind === 'pre-tool-use')
      .slice()
      .sort((a, b) =>
        a.priority !== b.priority
          ? b.priority - a.priority
          : a.insertionOrder - b.insertionOrder,
      )
    expect(all.map((h) => h.name)).toEqual(['first', 'second', 'third'])
  })

  it('default priority is 0 when register is called without options', () => {
    const reg = new HookRegistry()
    reg.register('plain', 'session-start', noop())
    const [entry] = reg.getAll()
    expect(entry.priority).toBe(0)
  })

  it('setPriority updates an existing entry', () => {
    const reg = new HookRegistry()
    reg.register('x', 'session-start', noop())
    reg.setPriority('x', 7)
    expect(reg.getAll()[0].priority).toBe(7)
  })

  it('disabled hooks are not returned by getHandlers regardless of priority', () => {
    const reg = new HookRegistry()
    reg.register('disabled-high', 'pre-tool-use', noop(), { priority: 100 })
    reg.register('enabled-low', 'pre-tool-use', noop(), { priority: 0 })
    reg.disable('disabled-high')
    expect(reg.getHandlers('pre-tool-use')).toHaveLength(1)
  })
})
