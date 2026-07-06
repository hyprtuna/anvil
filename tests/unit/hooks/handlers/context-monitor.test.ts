import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import { contextMonitorHandler } from '../../../../src/hooks/handlers/context-monitor.js'

function makeCtx(payload: unknown) {
  return {
    kind: 'context-monitor' as const,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {},
    payload,
  }
}

describe('hooks/handlers/context-monitor', () => {
  it('returns OK when usage is below 65%', async () => {
    const r = await contextMonitorHandler(
      makeCtx({
        contextTokens: 50_000,
        contextLimit: 200_000,
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('OK')
    expect(r.context).toMatchObject({ severity: 'ok', usagePercent: 25 })
  })

  it('returns WARNING when usage is between 65% and 79%', async () => {
    const r = await contextMonitorHandler(
      makeCtx({
        contextTokens: 140_000,
        contextLimit: 200_000,
      }),
    )
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('WARNING')
    expect(r.context).toMatchObject({ severity: 'warning', usagePercent: 70 })
  })

  it('returns CRITICAL when usage is 80% or above', async () => {
    const r = await contextMonitorHandler(
      makeCtx({
        contextTokens: 170_000,
        contextLimit: 200_000,
      }),
    )
    expect(r.exitCode).toBe(1)
    expect(r.message).toContain('CRITICAL')
    expect(r.context).toMatchObject({ severity: 'critical', usagePercent: 85 })
  })

  it('returns OK with no-data message when contextTokens is 0', async () => {
    const r = await contextMonitorHandler(
      makeCtx({
        contextTokens: 0,
        contextLimit: 200_000,
      }),
    )
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('no usage data')
  })

  it('handles null payload gracefully', async () => {
    const r = await contextMonitorHandler(makeCtx(null))
    expect(r.exitCode).toBe(0)
    expect(r.message).toContain('no usage data')
  })
})

// J4: HookResult shape contract
describe('hooks/handlers/context-monitor — HookResult shape', () => {
  it('no-usage-data path passes HookResult.parse()', async () => {
    const r = await contextMonitorHandler(makeCtx({ contextTokens: 0 }))
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('ok-usage path passes HookResult.parse()', async () => {
    const r = await contextMonitorHandler(
      makeCtx({ contextTokens: 10000, contextLimit: 200000 }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('warning path passes HookResult.parse()', async () => {
    const r = await contextMonitorHandler(
      makeCtx({ contextTokens: 140000, contextLimit: 200000 }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })

  it('critical path passes HookResult.parse()', async () => {
    const r = await contextMonitorHandler(
      makeCtx({ contextTokens: 170000, contextLimit: 200000 }),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
