import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { postEditHandler } from '../../../../src/hooks/handlers/post-edit.js'

describe('hooks/handlers/post-edit', () => {
  it('returns SUCCESS and reports the edited file', async () => {
    const r = await postEditHandler({
      kind: 'post-edit',
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { file: 'src/index.ts' },
    })
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('src/index.ts')
  })

  it('returns SUCCESS for .tsx files (UI rules moved to skill — Plan 39 Phase E)', async () => {
    const ctx = {
      kind: 'post-edit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: {
        file: 'App.tsx',
        content: 'const style = { color: "#ff00ff" };',
      },
    }
    const result = await postEditHandler(ctx)
    expect(result.exitCode).toBe(0)
    // uiViolations no longer emitted — logic lives in skills/universal/ui/rules.md
    expect(result.context?.uiViolations).toBeUndefined()
  })

  it('returns SUCCESS for non-UI files', async () => {
    const ctx = {
      kind: 'post-edit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { file: 'utils.ts', content: 'const x = 1;' },
    }
    const result = await postEditHandler(ctx)
    expect(result.exitCode).toBe(0)
    expect(result.context?.uiViolations).toBeUndefined()
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/post-edit — HookResult shape', () => {
  it('passes HookResult.parse() for all return paths', async () => {
    const ctx = {
      kind: 'post-edit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: { file: 'src/app.ts', content: 'const x = 1' },
    }
    const r = await postEditHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const ctx = {
      kind: 'post-edit' as const,
      cwd: '/tmp',
      config: buildDefaultConfig(),
      env: {},
      payload: null,
    }
    const r = await postEditHandler(ctx)
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
