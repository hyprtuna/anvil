import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { onPrOpenHandler } from '../../../../src/hooks/handlers/on-pr-open.js'

const makeCtx = (payload: unknown) => ({
  kind: 'on-pr-open' as const,
  cwd: '/tmp',
  config: buildDefaultConfig(),
  env: {},
  payload,
})

describe('hooks/handlers/on-pr-open', () => {
  it('returns SUCCESS and reports PR info', async () => {
    const r = await onPrOpenHandler(
      makeCtx({ prNumber: 42, branch: 'feat/login' }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('42')
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/on-pr-open — HookResult shape', () => {
  it('passes HookResult.parse() with full payload', async () => {
    const r = await onPrOpenHandler(
      makeCtx({ prNumber: 42, branch: 'feat/login' }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('passes HookResult.parse() with null payload', async () => {
    const r = await onPrOpenHandler(makeCtx(null))
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
