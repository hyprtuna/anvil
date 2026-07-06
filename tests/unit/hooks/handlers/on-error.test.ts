import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { onErrorHandler } from '../../../../src/hooks/handlers/on-error.js'

const makeCtx = (payload: unknown) => ({
  kind: 'on-error' as const,
  cwd: '/tmp',
  config: buildDefaultConfig(),
  env: {},
  payload,
})

describe('hooks/handlers/on-error', () => {
  it('returns SUCCESS and logs the error', async () => {
    const r = await onErrorHandler(
      makeCtx({ error: 'test error', stack: 'Error\n  at test' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('test error')
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/on-error — HookResult shape', () => {
  it('passes HookResult.parse() with full payload', async () => {
    const r = await onErrorHandler(
      makeCtx({ error: 'test error', stack: 'Error\n  at test' }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with undefined stack', async () => {
    const r = await onErrorHandler(makeCtx({ error: 'test error' }))
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const r = await onErrorHandler(makeCtx(null))
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
