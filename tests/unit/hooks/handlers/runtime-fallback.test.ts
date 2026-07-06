import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { HookResult } from '../../../../src/core/types.js'
import {
  RUNTIME_FALLBACK_LOG_FILE,
  runtimeFallbackHandler,
} from '../../../../src/hooks/handlers/runtime-fallback.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

/**
 * Plan 44 Phase G — reactive runtime-fallback handler.
 *
 * Verifies the on-error envelope path: code='model_not_available' or
 * 'rate_limit_exceeded' triggers a chain advance up to the shared retry
 * budget (RUNTIME_FALLBACK_MAX_RETRIES from src/skills/runtime.ts);
 * unrelated errors are no-ops; every decision is structured-logged.
 */

const tempHome = createTestTmpDir('runtime-fallback')

const makeCtx = (
  payload: unknown,
  opts: {
    fallbackChain?: string[]
    attempt?: number
    enabled?: boolean
  } = {},
) => ({
  kind: 'on-error' as const,
  cwd: '/tmp',
  config: buildDefaultConfig(),
  env: {
    HOME: tempHome,
    ...(opts.enabled === false ? {} : { ANVIL_RUNTIME_FALLBACK: '1' }),
  },
  payload: {
    ...((payload as object) ?? {}),
    fallback_chain: opts.fallbackChain,
    attempt: opts.attempt,
  },
})

describe('hooks/handlers/runtime-fallback (Plan 44 Phase G)', () => {
  // ANV-0160: capture origHome so afterEach can restore after each test sets HOME
  let origHome: string | undefined

  beforeEach(() => {
    origHome = process.env.HOME
    process.env.HOME = tempHome
  })
  afterEach(() => {
    vi.restoreAllMocks()
    // ANV-0160: restore HOME after each test (architecture guard requirement)
    if (origHome !== undefined) process.env.HOME = origHome
  })

  it('advances chain on model_not_available with budget remaining', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx(
        { code: 'model_not_available', error: 'no capacity', model: 'haiku' },
        { fallbackChain: ['sonnet', 'opus'], attempt: 0 },
      ),
    )
    expect(r.exitCode).toBe(0)
    expect(r.context).toBeDefined()
    expect(r.context?.decision).toBe('advance')
    expect(r.context?.next_model).toBe('sonnet')
  })

  it('advances chain on rate_limit_exceeded', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx(
        { code: 'rate_limit_exceeded', error: 'slow down', model: 'haiku' },
        { fallbackChain: ['sonnet', 'opus'], attempt: 0 },
      ),
    )
    expect(r.context?.decision).toBe('advance')
  })

  it('no-ops when retry budget is exhausted', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx(
        { code: 'model_not_available', error: 'still nope', model: 'opus' },
        { fallbackChain: ['sonnet', 'opus'], attempt: 2 },
      ),
    )
    expect(r.context?.decision).toBe('budget-exhausted')
  })

  it('no-ops when no fallback chain is present', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx({ code: 'model_not_available', error: 'no chain' }, {}),
    )
    expect(r.context?.decision).toBe('no-chain')
  })

  it('no-ops on non-retryable error code (e.g. authentication_error)', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx(
        { code: 'authentication_error', error: 'bad key' },
        { fallbackChain: ['sonnet'] },
      ),
    )
    expect(r.context?.decision).toBe('not-retryable')
  })

  it('writes a structured JSONL entry to the log file on every decision', async () => {
    await runtimeFallbackHandler(
      makeCtx(
        { code: 'model_not_available', error: 'oops', model: 'haiku' },
        { fallbackChain: ['sonnet'], attempt: 0 },
      ),
    )
    const logPath = join(tempHome, '.anvil', 'logs', RUNTIME_FALLBACK_LOG_FILE)
    const log = readFileSync(logPath, 'utf-8').trim().split('\n')
    expect(log.length).toBeGreaterThan(0)
    const last = JSON.parse(log[log.length - 1])
    expect(last.decision).toBe('advance')
    expect(last.code).toBe('model_not_available')
    expect(typeof last.timestamp).toBe('string')
  })

  it('returns "disabled" decision when neither env nor config opts in', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx(
        { code: 'model_not_available', error: 'oops', model: 'haiku' },
        { fallbackChain: ['sonnet'], attempt: 0, enabled: false },
      ),
    )
    expect(r.exitCode).toBe(0)
    expect(r.context?.decision).toBe('disabled')
  })

  it('returns a HookResult-shaped object', async () => {
    const r = await runtimeFallbackHandler(
      makeCtx(
        { code: 'model_not_available', error: 'oops' },
        { fallbackChain: ['sonnet'], attempt: 0 },
      ),
    )
    expect(() => HookResult.parse(r)).not.toThrow()
  })
})
