import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { postToolUseHandler } from '../../../../src/hooks/handlers/post-tool-use.js'

describe('hooks/handlers/post-tool-use', () => {
  it('returns SUCCESS with tool info when payload is provided', async () => {
    const r = await postToolUseHandler({
      kind: 'post-tool-use',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { tool: 'Read', result: 'file contents' },
    })
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('Read')
    expect(r.context).toMatchObject({ tool: 'Read', result: 'file contents' })
  })

  it('returns SUCCESS with defaults when payload is null', async () => {
    const r = await postToolUseHandler({
      kind: 'post-tool-use',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    })
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('unknown')
    expect(r.context).toMatchObject({ tool: 'unknown', result: '' })
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/post-tool-use — HookResult shape', () => {
  it('passes HookResult.parse() with full payload', async () => {
    const ctx = {
      kind: 'post-tool-use' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { tool: 'Read', result: 'file contents' },
    }
    const r = await postToolUseHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const ctx = {
      kind: 'post-tool-use' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await postToolUseHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
