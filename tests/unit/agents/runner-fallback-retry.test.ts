/**
 * tests/unit/agents/runner-fallback-retry.test.ts
 *
 * Unit tests for the fallback_chain retry loop inside `runInvocation`
 * (Plan 33 D1–D2).
 *
 * The retry loop is embedded in `runInvocation` in src/agents/runner.ts:
 * - On retryable SDK error (model_not_available / rate_limit_exceeded),
 *   the runner clones the invocation with the next chain entry and retries.
 * - Cap: 2 retries = 3 total attempts (primary + 2 fallbacks).
 * - After cap: original error surfaces (not the last retry's error).
 * - Non-retryable error: no retry, error surfaces immediately.
 * - Empty chain: no retry path executes.
 */

import { describe, expect, it } from 'vitest'
import {
  type AgentInvocation,
  type InvocationExecutor,
  prepareInvocation,
  runInvocation,
} from '../../../src/agents/runner.js'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { AgentRegistry } from '../../../src/core/registry/agent-registry.js'
import type { Agent, ModelsConfig } from '../../../src/core/types.js'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SONNET = 'claude-sonnet-4-6'

function makeAgent(name: string): Agent {
  return {
    frontmatter: {
      name,
      description: `${name} test agent`,
      model: SONNET,
      tools: ['Read'],
      max_turns: 5,
      effort: 'medium',
    },
    body: `# ${name}\n\nTest agent body.`,
    sourcePath: `/fake/agents/${name}.md`,
  }
}

function makeRegistry(name: string): AgentRegistry {
  const reg = new AgentRegistry()
  reg.register(makeAgent(name))
  return reg
}

/** Config with a 2-entry fallback chain (defaults from buildDefaultConfig). */
function makeConfig(): ModelsConfig {
  return buildDefaultConfig()
}

/** Config with no fallback chain. */
function makeConfigNoChain(): ModelsConfig {
  const base = buildDefaultConfig()
  return {
    ...base,
    defaults: { ...base.defaults, fallback_chain: [] },
  }
}

function makeRetryableError(
  code: 'model_not_available' | 'rate_limit_exceeded',
): Error {
  const err = new Error(`SDK: ${code}`)
  ;(err as NodeJS.ErrnoException).code = code
  return err
}

function makeNonRetryableError(): Error {
  const err = new Error('SDK: authentication_error')
  ;(err as NodeJS.ErrnoException).code = 'authentication_error'
  return err
}

/**
 * Mock executor that records which model was invoked each call.
 * Fails on the first `failCount` calls with the given error, then succeeds.
 */
function makeMockExecutor(
  failCount: number,
  err: Error = makeRetryableError('rate_limit_exceeded'),
): { executor: InvocationExecutor; modelCalls: string[] } {
  const modelCalls: string[] = []
  let callCount = 0

  const executor: InvocationExecutor = async (inv: AgentInvocation) => {
    callCount++
    modelCalls.push(inv.resolvedModel.model)
    if (callCount <= failCount) throw err
    return '{"status":"done"}'
  }

  return { executor, modelCalls }
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('runInvocation — fallback_chain retry loop', () => {
  it('succeeds on the first attempt when no error occurs', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, modelCalls } = makeMockExecutor(0) // never fails

    const result = await runInvocation(inv, executor)
    expect(result.status).toBe('done')
    expect(modelCalls).toHaveLength(1)
    expect(modelCalls[0]).toBe(inv.resolvedModel.model)
  })

  it('retries with the first chain entry on the first retryable error', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    // check that the executor was called with chain[0] on retry
    const { executor, modelCalls } = makeMockExecutor(1) // fails once

    const result = await runInvocation(inv, executor)
    expect(result.status).toBe('done')
    expect(modelCalls).toHaveLength(2) // primary + 1 retry
    expect(modelCalls[1]).toBe(inv.fallback_chain[0]) // chain[0]
  })

  it('retries up to 2 times and succeeds on the third attempt (primary + 2 retries)', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, modelCalls } = makeMockExecutor(2) // fails twice

    const result = await runInvocation(inv, executor)
    expect(result.status).toBe('done')
    expect(modelCalls).toHaveLength(3) // primary + 2 retries
    expect(modelCalls[1]).toBe(inv.fallback_chain[0]) // chain[0]
    expect(modelCalls[2]).toBe(inv.fallback_chain[1]) // chain[1]
  })

  it('surfaces the ORIGINAL error after exhausting 2 retries (3 total attempts)', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const originalErr = makeRetryableError('rate_limit_exceeded')
    const { executor, modelCalls } = makeMockExecutor(99, originalErr) // always fails

    await expect(runInvocation(inv, executor)).rejects.toThrow(
      'SDK: rate_limit_exceeded',
    )
    // 1 primary + 2 retries = 3 total, no fourth attempt
    expect(modelCalls).toHaveLength(3)
  })

  it('surfaces the original error (not the last retry error) after cap', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')

    let callCount = 0
    const errors = [
      makeRetryableError('rate_limit_exceeded'),
      makeRetryableError('model_not_available'),
      makeRetryableError('rate_limit_exceeded'),
    ]
    const executor: InvocationExecutor = async () => {
      const err = errors[callCount] ?? errors[errors.length - 1]
      callCount++
      throw err
    }

    // The ORIGINAL error (first thrown) should be what surfaces
    await expect(runInvocation(inv, executor)).rejects.toBe(errors[0])
  })

  it('does NOT retry on a non-retryable error', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, modelCalls } = makeMockExecutor(
      1,
      makeNonRetryableError(),
    )

    await expect(runInvocation(inv, executor)).rejects.toThrow(
      'SDK: authentication_error',
    )
    // Only the primary attempt — no retry on non-retryable
    expect(modelCalls).toHaveLength(1)
  })

  it('does NOT retry when fallback_chain is empty', async () => {
    const config = makeConfigNoChain()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    expect(inv.fallback_chain).toHaveLength(0)

    const { executor, modelCalls } = makeMockExecutor(99)

    await expect(runInvocation(inv, executor)).rejects.toThrow(
      'SDK: rate_limit_exceeded',
    )
    // Only the primary attempt — no chain entries to retry with
    expect(modelCalls).toHaveLength(1)
  })

  it('retries on model_not_available as well as rate_limit_exceeded', async () => {
    const config = makeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, modelCalls } = makeMockExecutor(
      1,
      makeRetryableError('model_not_available'),
    )

    const result = await runInvocation(inv, executor)
    expect(result.status).toBe('done')
    expect(modelCalls).toHaveLength(2)
    expect(modelCalls[1]).toBe(inv.fallback_chain[0])
  })
})
