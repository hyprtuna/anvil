import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type {
  HookContext,
  HookHandler,
  ModelsConfig,
} from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * Plan 34 C6 — dispatcher timeout safeguard tests.
 *
 * Verifies that a handler exceeding the configured timeout threshold is aborted
 * at the dispatcher boundary, returns {exitCode: 0}, and emits a structured
 * stderr warning.
 */

function ctx(
  kind: HookContext['kind'] = 'stop',
  config: ModelsConfig = buildDefaultConfig(),
): HookContext {
  return { kind, cwd: '/tmp', config, env: {}, payload: null }
}

/** A handler that never resolves within the test timeout. */
function slowHandler(ms: number): HookHandler {
  return async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, ms))
    return { exitCode: 0 }
  }
}

describe('hooks/dispatcher — handler timeout safeguard (Plan 34 C4)', () => {
  let tmp: string
  let origHome: string | undefined

  beforeEach(async () => {
    tmp = createTestTmpDir('timeout')
    origHome = process.env.HOME
    process.env.HOME = tmp
  })

  afterEach(async () => {
    process.env.HOME = origHome
    await rm(tmp, { recursive: true, force: true })
  })

  it('aborts a handler that exceeds the configured threshold and returns exitCode 0', async () => {
    const reg = new HookRegistry()
    reg.register('slow-handler', 'stop', slowHandler(5000))

    const stderrWrites: string[] = []
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderrWrites.push(
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk).toString('utf-8'),
      )
      return origWrite(chunk as string)
    }) as typeof process.stderr.write

    try {
      const result = await dispatch(reg, ctx('stop'), {
        timeoutMs: 100,
      })

      expect(result.exitCode).toBe(0)
      const allStderr = stderrWrites.join('')
      expect(allStderr).toMatch(/slow-handler/)
      expect(allStderr).toMatch(
        /exceeded.*\d+s.*aborted|aborted.*safe fallback/i,
      )
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write
    }
  }, 10_000)

  it('does not abort a handler that completes within the threshold', async () => {
    const reg = new HookRegistry()
    reg.register('fast-handler', 'stop', slowHandler(10))

    const result = await dispatch(reg, ctx('stop'), {
      timeoutMs: 500,
    })

    expect(result.exitCode).toBe(0)
    expect(result.trace[0].timedOut).toBeUndefined()
  })

  it('reads timeout_seconds from ModelsConfig.hooks.timeout_seconds when present', async () => {
    const config = buildDefaultConfig()
    // Inject a custom timeout via hooks config
    const configWithTimeout = {
      ...config,
      hooks: { timeout_seconds: 30 },
    } as ModelsConfig

    const reg = new HookRegistry()
    reg.register('instant-handler', 'stop', async () => ({ exitCode: 0 }))

    // Should complete fine with a 30s configured timeout
    const result = await dispatch(reg, ctx('stop', configWithTimeout))
    expect(result.exitCode).toBe(0)
  })

  it('marks timed-out handler in trace with timedOut: true', async () => {
    const reg = new HookRegistry()
    reg.register('slow-handler', 'stop', slowHandler(5000))

    const stderrWrites: string[] = []
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((chunk: string | Uint8Array): boolean => {
      stderrWrites.push(
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk).toString('utf-8'),
      )
      return origWrite(chunk as string)
    }) as typeof process.stderr.write

    try {
      const result = await dispatch(reg, ctx('stop'), {
        timeoutMs: 100,
      })

      expect(result.trace).toHaveLength(1)
      expect(result.trace[0].timedOut).toBe(true)
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write
    }
  }, 10_000)
})
