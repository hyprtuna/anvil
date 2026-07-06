import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookResult } from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'

/** Plan 28 D4 — matcher / `if` filtering, skipped trace entries. */

const baseCtx = (payload: unknown) => ({
  kind: 'pre-tool-use' as const,
  cwd: '/tmp/test',
  config: buildDefaultConfig(),
  env: {},
  payload,
})

describe('hooks/dispatcher — matcher filtering', () => {
  it('skips hooks whose matcher does not match the payload tool', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'bash-only',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { matcher: 'Bash' },
    )

    const result = await dispatch(reg, baseCtx({ tool_name: 'Read' }))
    expect(called).toBe(false)
    expect(result.trace[0]).toMatchObject({
      hookName: 'bash-only',
      skipped: true,
      skipReason: 'matcher',
    })
  })

  it('runs hooks whose matcher matches', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'bash-only',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { matcher: 'Bash' },
    )

    await dispatch(reg, baseCtx({ tool_name: 'Bash' }))
    expect(called).toBe(true)
  })

  it('treats empty matcher as match-everything', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'always',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { matcher: '' },
    )

    await dispatch(reg, baseCtx({ tool_name: 'Read' }))
    expect(called).toBe(true)
  })

  it('matcher with regex metacharacters is interpreted as a regex', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'edit-or-write',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { matcher: 'Edit|Write' },
    )

    await dispatch(reg, baseCtx({ tool_name: 'Write' }))
    expect(called).toBe(true)
  })
})

describe('hooks/dispatcher — if rule filtering', () => {
  it('skips hooks whose if rule excludes the payload', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'git-only',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { ifRules: 'Bash(git *)' },
    )

    const result = await dispatch(
      reg,
      baseCtx({
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf /' },
      }),
    )
    expect(called).toBe(false)
    expect(result.trace[0]).toMatchObject({
      hookName: 'git-only',
      skipped: true,
      skipReason: 'if',
    })
  })

  it('runs hooks whose if rule matches', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'git-only',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { ifRules: 'Bash(git *)' },
    )

    await dispatch(
      reg,
      baseCtx({
        tool_name: 'Bash',
        tool_input: { command: 'git status' },
      }),
    )
    expect(called).toBe(true)
  })

  it('OR semantics: array of rules, any match runs the hook', async () => {
    const reg = new HookRegistry()
    let called = false
    reg.register(
      'pkg-managers',
      'pre-tool-use',
      async (): Promise<HookResult> => {
        called = true
        return { exitCode: 0 }
      },
      { ifRules: ['Bash(npm *)', 'Bash(yarn *)', 'Bash(pnpm *)'] },
    )

    await dispatch(
      reg,
      baseCtx({
        tool_name: 'Bash',
        tool_input: { command: 'pnpm install' },
      }),
    )
    expect(called).toBe(true)
  })
})
