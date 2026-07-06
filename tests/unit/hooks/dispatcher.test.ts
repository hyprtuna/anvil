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

describe('hooks/dispatcher', () => {
  it('returns SUCCESS when no handlers are registered', async () => {
    const reg = new HookRegistry()
    const result = await dispatch(reg, baseCtx())
    expect(result.exitCode).toBe(0)
  })

  it('runs all handlers for the given kind', async () => {
    const reg = new HookRegistry()
    const order: string[] = []
    reg.register('hook-a', 'pre-commit', async (): Promise<HookResult> => {
      order.push('a')
      return { exitCode: 0 }
    })
    reg.register('hook-b', 'pre-commit', async (): Promise<HookResult> => {
      order.push('b')
      return { exitCode: 0 }
    })
    await dispatch(reg, baseCtx())
    expect(order).toEqual(['a', 'b'])
  })

  it('returns the worst exit code across all handlers', async () => {
    const reg = new HookRegistry()
    reg.register(
      'warn-hook',
      'pre-commit',
      async (): Promise<HookResult> => ({
        exitCode: 1,
        message: 'warning',
      }),
    )
    reg.register(
      'block-hook',
      'pre-commit',
      async (): Promise<HookResult> => ({
        exitCode: 2,
        message: 'blocked',
      }),
    )
    const result = await dispatch(reg, baseCtx())
    expect(result.exitCode).toBe(2)
    expect(result.messages).toHaveLength(2)
  })

  it('stops on BLOCK when stopOnBlock=true', async () => {
    const reg = new HookRegistry()
    let second = false
    reg.register(
      'block-hook',
      'pre-commit',
      async (): Promise<HookResult> => ({
        exitCode: 2,
        message: 'blocked',
      }),
    )
    reg.register('second-hook', 'pre-commit', async (): Promise<HookResult> => {
      second = true
      return { exitCode: 0 }
    })
    await dispatch(reg, baseCtx(), { stopOnBlock: true })
    expect(second).toBe(false)
  })

  it('catches thrown errors and treats them as BLOCK', async () => {
    const reg = new HookRegistry()
    reg.register('error-hook', 'pre-commit', async () => {
      throw new Error('boom')
    })
    const result = await dispatch(reg, baseCtx())
    expect(result.exitCode).toBe(2)
    expect(result.messages.some((m) => m.includes('boom'))).toBe(true)
  })

  it('skips disabled hooks', async () => {
    const reg = new HookRegistry()
    let ran = false
    reg.register(
      'disabled-hook',
      'pre-commit',
      async (): Promise<HookResult> => {
        ran = true
        return { exitCode: 0 }
      },
    )
    reg.disable('disabled-hook')
    await dispatch(reg, baseCtx())
    expect(ran).toBe(false)
  })

  it('preserves handler execution order', async () => {
    const reg = new HookRegistry()
    const order: number[] = []
    for (let i = 0; i < 5; i++) {
      const idx = i
      reg.register(`hook-${i}`, 'pre-commit', async (): Promise<HookResult> => {
        order.push(idx)
        return { exitCode: 0 }
      })
    }
    await dispatch(reg, baseCtx())
    expect(order).toEqual([0, 1, 2, 3, 4])
  })

  it('collects messages from all handlers', async () => {
    const reg = new HookRegistry()
    reg.register(
      'ctx-hook',
      'pre-commit',
      async (): Promise<HookResult> => ({
        exitCode: 0,
        message: 'hook ran',
      }),
    )
    const result = await dispatch(reg, baseCtx())
    expect(result.messages.some((m) => m.includes('hook ran'))).toBe(true)
  })

  it('ignores hooks registered for a different kind', async () => {
    const reg = new HookRegistry()
    let ran = false
    reg.register(
      'session-hook',
      'session-start',
      async (): Promise<HookResult> => {
        ran = true
        return { exitCode: 0 }
      },
    )
    // dispatching pre-commit should not run session-start hooks
    await dispatch(reg, baseCtx())
    expect(ran).toBe(false)
  })
})

// Plan 31 H6 — dispatcher matcher + ifRules coverage
describe('hooks/dispatcher — H6 matcher and ifRules', () => {
  const makeCtx = (
    payload: unknown = null,
    kind: 'pre-commit' | 'pre-tool-use' = 'pre-commit',
  ) => ({
    kind,
    cwd: '/tmp/test',
    config: buildDefaultConfig(),
    env: { MY_VAR: 'hello' } as Record<string, string>,
    payload,
  })

  it('H6-1: hook with tool-name matcher only fires when payload tool matches', async () => {
    // The dispatcher's `matcher` field filters on tool_name in the payload.
    // A 'pre-commit' hook can still have a matcher — it will only fire if
    // the payload has a matching tool field.
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'bash-matcher-hook',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { matcher: 'Bash' },
    )
    // Dispatching with a non-Bash tool payload → hook is skipped
    await dispatch(reg, makeCtx({ tool_name: 'Read' }, 'pre-tool-use'))
    expect(called).toBe(false)
    // Trace shows skipReason: 'matcher'
    const result = await dispatch(
      reg,
      makeCtx({ tool_name: 'Read' }, 'pre-tool-use'),
    )
    expect(result.trace[0]?.skipped).toBe(true)
    expect(result.trace[0]?.skipReason).toBe('matcher')
    // Dispatching with Bash payload → hook fires
    await dispatch(reg, makeCtx({ tool_name: 'Bash' }, 'pre-tool-use'))
    expect(called).toBe(true)
  })

  it('H6-2: hook with glob matcher fires for matching tool names', async () => {
    const reg = new HookRegistry()
    const fired: string[] = []
    reg.register(
      'write-hook',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        fired.push('write')
        return { exitCode: 0 }
      },
      { matcher: 'Write' },
    )
    // Edit tool → does not match Write
    await dispatch(reg, makeCtx({ tool_name: 'Edit' }, 'pre-tool-use'))
    expect(fired).toHaveLength(0)
    // Write tool → matches
    await dispatch(reg, makeCtx({ tool_name: 'Write' }, 'pre-tool-use'))
    expect(fired).toHaveLength(1)
  })

  it('H6-3: hook with ifRules only fires when the rule matches the payload', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'bash-if-hook',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { ifRules: 'Bash(git *)' },
    )
    // Non-Bash tool → ifRules does not match → skip
    await dispatch(
      reg,
      makeCtx(
        { tool_name: 'Read', tool_input: { file_path: '/src/a.ts' } },
        'pre-tool-use',
      ),
    )
    expect(called).toBe(false)
    // Bash with git command → matches
    await dispatch(
      reg,
      makeCtx(
        { tool_name: 'Bash', tool_input: { command: 'git status' } },
        'pre-tool-use',
      ),
    )
    expect(called).toBe(true)
  })

  it('H6-4: hook with no matcher and no ifRules fires on all events of its kind', async () => {
    const reg = new HookRegistry()
    let callCount = 0
    reg.register(
      'always-hook',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        callCount++
        return { exitCode: 0 }
      },
      // No matcher, no ifRules
    )
    await dispatch(reg, makeCtx({ tool_name: 'Read' }, 'pre-tool-use'))
    await dispatch(reg, makeCtx({ tool_name: 'Bash' }, 'pre-tool-use'))
    await dispatch(reg, makeCtx({ tool_name: 'Edit' }, 'pre-tool-use'))
    // Should have fired all 3 times
    expect(callCount).toBe(3)
  })
})
