/**
 * Plan 35 P3 — Integration tests for entrypoint validateAndTimeHandler routing.
 *
 * Verifies that:
 * 1. validateAndTimeHandler (now used by the entrypoint) logs validation failures
 *    to ~/.anvil/logs/hook-validation-failures.json on invalid HookResult shape.
 * 2. validateAndTimeHandler returns a safe fallback (exitCode: 0) on invalid shape
 *    so no malformed envelope reaches CC.
 * 3. validateAndTimeHandler appends a timing entry to ~/.anvil/logs/hook-timings.jsonl
 *    on every invocation (valid or invalid result).
 * 4. A valid handler returns its result unchanged and still logs timing.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import type { HookContext } from '../../src/core/types.js'
import { validateAndTimeHandler } from '../../src/hooks/wrap.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function makeCtx(kind: HookContext['kind'] = 'pre-commit'): HookContext {
  return {
    kind,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {},
    payload: null,
  }
}

describe('hooks/entrypoint — validateAndTimeHandler (Plan 35 P2)', () => {
  let tmp: string
  let origHome: string | undefined
  let validationLogPath: string
  let timingLogPath: string

  beforeEach(async () => {
    tmp = createTestTmpDir('ep')
    origHome = process.env.HOME
    process.env.HOME = tmp
    await mkdir(join(tmp, '.anvil', 'logs'), { recursive: true })
    validationLogPath = join(
      tmp,
      '.anvil',
      'logs',
      'hook-validation-failures.json',
    )
    timingLogPath = join(tmp, '.anvil', 'logs', 'hook-timings.jsonl')
  })

  afterEach(async () => {
    process.env.HOME = origHome
    await rm(tmp, { recursive: true, force: true })
  })

  it('returns a safe fallback (exitCode: 0) when handler returns invalid shape', async () => {
    const ctx = makeCtx('pre-commit')
    // Return a shape that fails HookResult.safeParse (missing required exitCode).
    const handler = async () => ({ badKey: true }) as unknown as { exitCode: 0 }

    const result = await validateAndTimeHandler(
      'test-bad',
      'pre-commit',
      ctx,
      handler,
    )

    // Safe fallback — never blocks CC.
    expect(result.exitCode).toBe(0)
    expect(result.message).toContain('validation failed')
  })

  it('logs validation failure to hook-validation-failures.json', async () => {
    const ctx = makeCtx('pre-commit')
    const handler = async () => ({ badKey: true }) as unknown as { exitCode: 0 }

    await validateAndTimeHandler('test-bad', 'pre-commit', ctx, handler)

    const raw = await readFile(validationLogPath, 'utf-8')
    const failures = JSON.parse(raw) as Array<Record<string, unknown>>
    expect(failures.length).toBeGreaterThanOrEqual(1)

    const entry = failures[failures.length - 1]
    expect(entry).toMatchObject({
      kind: 'pre-commit',
      handler: 'test-bad',
    })
    expect(typeof entry.ts).toBe('string')
    expect(Array.isArray(entry.validationErrors)).toBe(true)
  })

  it('appends a timing entry on every handler invocation', async () => {
    const ctx = makeCtx('session-start')
    const handler = async () => ({ exitCode: 0 as const })

    await validateAndTimeHandler('test-valid', 'session-start', ctx, handler)

    const raw = await readFile(timingLogPath, 'utf-8')
    const lines = raw.trim().split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(1)

    const entry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>
    expect(entry).toMatchObject({
      kind: 'session-start',
      handler: 'test-valid',
      exitCode: 0,
    })
    expect(typeof entry.durationMs).toBe('number')
    expect(entry.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof entry.ts).toBe('string')
  })

  it('returns valid handler result unchanged and still logs timing', async () => {
    const ctx = makeCtx('user-prompt-submit')
    const handler = async () => ({
      exitCode: 0 as const,
      systemInsert: 'route: test-driven-development',
    })

    const result = await validateAndTimeHandler(
      'test-valid',
      'user-prompt-submit',
      ctx,
      handler,
    )

    expect(result.exitCode).toBe(0)
    expect(result.systemInsert).toBe('route: test-driven-development')

    // Timing log must have been written.
    expect(existsSync(timingLogPath)).toBe(true)
  })

  it('does NOT log to validation-failures when handler returns a valid shape', async () => {
    const ctx = makeCtx('pre-commit')
    const handler = async () => ({ exitCode: 0 as const, message: 'ok' })

    await validateAndTimeHandler('test-ok', 'pre-commit', ctx, handler)

    // Validation log must not exist (no failures occurred).
    expect(existsSync(validationLogPath)).toBe(false)
  })
})
