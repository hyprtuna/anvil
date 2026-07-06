/**
 * Plan 44 Phase H — runtime-fallback registration integration test.
 *
 * Verifies that the reactive runtime-fallback handler is registered alongside
 * the existing on-error handler and that the dispatcher invokes it without
 * surfacing errors. The handler self-gates inside (mirroring gateguard);
 * unit tests cover the decision matrix.
 */
import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { dispatch } from '../../src/hooks/dispatcher.js'
import { loadAllHooks } from '../../src/hooks/load-all.js'

describe('runtime-fallback registration (Plan 44 Phase H)', () => {
  it('registers >=2 handlers on the on-error kind (on-error + runtime-fallback)', () => {
    const config = buildDefaultConfig()
    const registry = loadAllHooks({ config })
    const handlers = registry.getHandlers('on-error')
    expect(handlers.length).toBeGreaterThanOrEqual(2)
  })

  it('dispatcher returns exit code 0 by default (handler self-gates to disabled)', async () => {
    const config = buildDefaultConfig()
    const registry = loadAllHooks({ config })
    const result = await dispatch(registry, {
      kind: 'on-error',
      cwd: '/tmp',
      config,
      env: {},
      payload: {
        code: 'model_not_available',
        error: 'no capacity',
        fallback_chain: ['sonnet', 'opus'],
        attempt: 0,
      },
    })
    expect(result.exitCode).toBe(0)
  })

  it('dispatcher returns exit code 0 when ANVIL_RUNTIME_FALLBACK=1 is set', async () => {
    const config = buildDefaultConfig()
    const registry = loadAllHooks({ config })
    const result = await dispatch(registry, {
      kind: 'on-error',
      cwd: '/tmp',
      config,
      env: { ANVIL_RUNTIME_FALLBACK: '1' },
      payload: {
        code: 'model_not_available',
        error: 'no capacity',
        fallback_chain: ['sonnet', 'opus'],
        attempt: 0,
      },
    })
    expect(result.exitCode).toBe(0)
  })
})
