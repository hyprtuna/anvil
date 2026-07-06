/**
 * tests/integration/model-fallback-cascade.test.ts
 *
 * Integration tests for the Phase E fallback_chain cascade (Plan 32 E).
 *
 * Scope: verifies that:
 * 1. `resolveModel` populates `fallback_chain` correctly on resolved invocations.
 * 2. `prepareInvocation` (runner) exposes `fallback_chain` on the returned object.
 * 3. A mock executor can walk the chain on rate-limit errors, respecting ≤2 retries.
 * 4. After 2 retries the original error surfaces.
 * 5. Empty fallback_chain skips retry logic entirely.
 *
 * NOTE: The actual SDK does not exist in this codebase — the runner uses an
 * injected `InvocationExecutor`. These tests use a mock executor that simulates
 * rate-limit failures, demonstrating the correct contract for any real executor
 * that implements retry behaviour using `AgentInvocation.fallback_chain`.
 * The retry loop itself lives in the executor, not in `runInvocation` — this
 * matches the documented deferral note in runner.ts and runtime.ts.
 */

import { describe, expect, it } from 'vitest'
import {
  type AgentInvocation,
  type InvocationExecutor,
  prepareInvocation,
} from '../../src/agents/runner.js'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { resolveModel } from '../../src/core/models/resolve.js'
import { AgentRegistry } from '../../src/core/registry/agent-registry.js'
import type { Agent, ModelsConfig } from '../../src/core/types.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SONNET = 'claude-sonnet-4-6'
const HAIKU = 'claude-haiku-4-5'

/** Minimal agent fixture for registry. */
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

/** Build a registry with a single agent. */
function makeRegistry(name: string): AgentRegistry {
  const registry = new AgentRegistry()
  registry.register(makeAgent(name))
  return registry
}

/**
 * Build a config with a non-empty fallback_chain so tests can verify cascade
 * plumbing. The defaults chain is [SONNET, HAIKU].
 */
function makeCascadeConfig(): ModelsConfig {
  return buildDefaultConfig()
}

/**
 * Mock executor that simulates SDK rate-limit errors for the first N calls,
 * then succeeds. Tracks which model was requested per call via the invocation.
 */
function makeRateLimitExecutor(failCount: number): {
  executor: InvocationExecutor
  calls: string[]
} {
  const calls: string[] = []
  let invocations = 0

  const executor: InvocationExecutor = async (inv: AgentInvocation) => {
    invocations++
    calls.push(inv.resolvedModel.model)

    if (invocations <= failCount) {
      const err = new Error('SDK: rate_limit_exceeded')
      ;(err as NodeJS.ErrnoException).code = 'rate_limit_exceeded'
      throw err
    }
    return '{"status":"done"}'
  }

  return { executor, calls }
}

/**
 * Retry wrapper that implements the ≤2-retry cap using the fallback_chain
 * on the invocation. This is what a real executor implementation should do.
 * The test asserts:
 * - Retries happen with the next chain entry.
 * - A third retry is NOT attempted (cap = 2).
 * - After the cap, the original error is re-thrown.
 */
async function runWithFallback(
  invocation: AgentInvocation,
  executor: InvocationExecutor,
  MAX_RETRIES = 2,
): Promise<string> {
  const chain = [...invocation.fallback_chain]
  let lastError: unknown

  // Attempt 0: primary model (already in invocation.resolvedModel.model)
  // Attempts 1..MAX_RETRIES: chain[0], chain[1], …
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const currentInvocation: AgentInvocation =
      attempt === 0
        ? invocation
        : {
            ...invocation,
            resolvedModel: {
              ...invocation.resolvedModel,
              model: chain[attempt - 1],
              source: 'default', // fallback — source is informational only
            },
          }

    try {
      return await executor(currentInvocation)
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? ''
      const isTransient =
        code === 'rate_limit_exceeded' || code === 'model_not_available'
      if (!isTransient || attempt >= MAX_RETRIES || attempt >= chain.length) {
        throw err
      }
      lastError = err
    }
  }

  // Unreachable — loop always throws or returns, but TS needs this
  throw lastError
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('model fallback cascade — plumbing', () => {
  it('resolveModel populates fallback_chain from defaults', () => {
    const config = makeCascadeConfig()
    const r = resolveModel('completely-unknown', config)
    expect(r.fallback_chain).toEqual([SONNET, HAIKU])
    expect(r.fallback_chain_source).toBe('default')
  })

  it('prepareInvocation exposes fallback_chain on AgentInvocation', () => {
    const config = makeCascadeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'do the thing')
    // planning is in planning group, chain sourced from defaults (group chain empty)
    expect(inv.fallback_chain).toEqual([SONNET, HAIKU])
  })

  it('empty fallback_chain on invocation when no layer defines one', () => {
    const config: ModelsConfig = {
      ...makeCascadeConfig(),
      defaults: {
        ...makeCascadeConfig().defaults,
        fallback_chain: [],
      },
    }
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'do the thing')
    expect(inv.fallback_chain).toEqual([])
  })
})

describe('model fallback cascade — retry cap with mock executor', () => {
  it('succeeds on first attempt when no rate-limit error', async () => {
    const config = makeCascadeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, calls } = makeRateLimitExecutor(0) // never fails

    const output = await runWithFallback(inv, executor)
    expect(output).toBe('{"status":"done"}')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toBe(inv.resolvedModel.model)
  })

  it('retries with second chain entry on first rate-limit error', async () => {
    const config = makeCascadeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, calls } = makeRateLimitExecutor(1) // fails once

    const output = await runWithFallback(inv, executor)
    expect(output).toBe('{"status":"done"}')
    expect(calls).toHaveLength(2) // primary + 1 retry
    expect(calls[0]).toBe(inv.resolvedModel.model) // primary
    expect(calls[1]).toBe(SONNET) // first fallback (chain[0])
  })

  it('retries up to 2 times and succeeds on third attempt', async () => {
    const config = makeCascadeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, calls } = makeRateLimitExecutor(2) // fails twice

    const output = await runWithFallback(inv, executor)
    expect(output).toBe('{"status":"done"}')
    expect(calls).toHaveLength(3) // primary + 2 retries
    expect(calls[0]).toBe(inv.resolvedModel.model)
    expect(calls[1]).toBe(SONNET) // chain[0]
    expect(calls[2]).toBe(HAIKU) // chain[1]
  })

  it('does NOT attempt a third retry — surfaces original error after cap', async () => {
    const config = makeCascadeConfig()
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    const { executor, calls } = makeRateLimitExecutor(99) // always fails

    await expect(runWithFallback(inv, executor)).rejects.toThrow(
      'SDK: rate_limit_exceeded',
    )
    // 1 primary + 2 retries = 3 total, no fourth attempt
    expect(calls).toHaveLength(3)
  })

  it('empty fallback_chain surfaces error immediately without retrying', async () => {
    const config: ModelsConfig = {
      ...makeCascadeConfig(),
      defaults: {
        ...makeCascadeConfig().defaults,
        fallback_chain: [],
      },
    }
    const registry = makeRegistry('planning')
    const inv = prepareInvocation(registry, config, 'planning', 'task')
    expect(inv.fallback_chain).toHaveLength(0)

    const { executor, calls } = makeRateLimitExecutor(99)

    await expect(runWithFallback(inv, executor)).rejects.toThrow(
      'SDK: rate_limit_exceeded',
    )
    // chain empty: attempt=0 fails, attempt=1 would need chain[0] which is undefined → throws
    expect(calls).toHaveLength(1) // only the initial call, no retries possible
  })
})
