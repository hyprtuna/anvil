/**
 * E-007 — runtime-fallback log-write dedup
 *
 * Verifies that when appendFile fails (e.g. EACCES), the handler:
 * 1. Writes exactly one stderr message across multiple invocations in the
 *    same module instance (module-scoped `warned` flag).
 * 2. Still returns context.decision (the safety net is preserved).
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ── helpers ────────────────────────────────────────────────────────────────

function makeCtx(home: string) {
  return {
    kind: 'on-error' as const,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {
      HOME: home,
      ANVIL_RUNTIME_FALLBACK: '1',
    },
    payload: {
      code: 'model_not_available',
      error: 'no capacity',
      model: 'haiku',
      fallback_chain: ['sonnet', 'opus'],
      attempt: 0,
    },
  }
}

// ── tests ──────────────────────────────────────────────────────────────────

describe('E-007 / runtime-fallback log-write dedup', () => {
  let home: string
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    home = createTestTmpDir('e007')
    mkdirSync(join(home, '.anvil', 'logs'), { recursive: true })
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (existsSync(home)) rmSync(home, { recursive: true, force: true })
  })

  it('writes exactly one stderr message across two invocations when appendFile fails', async () => {
    // Mock fs/promises appendFile to reject with EACCES
    // Mock the symlink-safe IO wrapper so safeAppend throws like an EACCES
    // disk failure. The runtime-fallback handler now writes via safeAppend
    // (ANV-0041); this mock preserves the original test intent.
    vi.mock('../../../../src/core/io/safe-write.js', async (importOriginal) => {
      const actual =
        await importOriginal<
          typeof import('../../../../src/core/io/safe-write.js')
        >()
      return {
        ...actual,
        safeAppend: vi.fn().mockImplementation(() => {
          throw Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES',
          })
        }),
      }
    })

    const { runtimeFallbackHandler } = await import(
      '../../../../src/hooks/handlers/runtime-fallback.js'
    )

    const ctx = makeCtx(home)
    await runtimeFallbackHandler(ctx)
    await runtimeFallbackHandler(ctx)

    // Exactly one stderr call — the second invocation is dedup'd
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const msg = stderrSpy.mock.calls[0][0] as string
    expect(msg).toContain('anvil hook on-error')
    expect(msg).toContain('runtime-fallback log write failed')
    expect(msg).toContain('telemetry disabled until restart')
  })

  it('still returns structured context.decision when appendFile fails', async () => {
    // Mock the symlink-safe IO wrapper so safeAppend throws like an EACCES
    // disk failure. The runtime-fallback handler now writes via safeAppend
    // (ANV-0041); this mock preserves the original test intent.
    vi.mock('../../../../src/core/io/safe-write.js', async (importOriginal) => {
      const actual =
        await importOriginal<
          typeof import('../../../../src/core/io/safe-write.js')
        >()
      return {
        ...actual,
        safeAppend: vi.fn().mockImplementation(() => {
          throw Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES',
          })
        }),
      }
    })

    const { runtimeFallbackHandler } = await import(
      '../../../../src/hooks/handlers/runtime-fallback.js'
    )

    const r = await runtimeFallbackHandler(makeCtx(home))
    expect(r.exitCode).toBe(0)
    expect(r.context).toBeDefined()
    expect(r.context?.decision).toBe('advance')
  })
})
