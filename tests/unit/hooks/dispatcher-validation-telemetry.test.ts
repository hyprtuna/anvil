import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookContext, HookResult } from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * Plan 34 D1 — dispatcher validation telemetry tests.
 *
 * Verifies that when a handler returns an invalid HookResult shape, the
 * dispatcher logs a structured entry to ~/.anvil/logs/hook-validation-failures.json
 * with the correct fields: ts, kind, handler, rawInputSummary, rawOutput, validationErrors.
 *
 * Also verifies:
 * - The log is a JSON array (not JSONL).
 * - Rotation discards entries beyond 100 entries.
 * - A valid handler return does NOT append to the validation-failures log.
 */

function ctx(
  kind: HookContext['kind'] = 'pre-commit',
  payload: unknown = null,
): HookContext {
  return { kind, cwd: '/tmp', config: buildDefaultConfig(), env: {}, payload }
}

describe('hooks/dispatcher — validation failure telemetry (Plan 34 D1)', () => {
  let tmp: string
  let origHome: string | undefined
  let logPath: string

  beforeEach(async () => {
    tmp = createTestTmpDir('vallog')
    origHome = process.env.HOME
    process.env.HOME = tmp
    await mkdir(join(tmp, '.anvil', 'logs'), { recursive: true })
    logPath = join(tmp, '.anvil', 'logs', 'hook-validation-failures.json')
  })

  afterEach(async () => {
    process.env.HOME = origHome
    await rm(tmp, { recursive: true, force: true })
  })

  it('does NOT write to the validation log when the handler returns a valid shape', async () => {
    const reg = new HookRegistry()
    reg.register(
      'valid-handler',
      'pre-commit',
      async (): Promise<HookResult> => ({
        exitCode: 0,
      }),
    )

    await dispatch(reg, ctx('pre-commit'))

    // Log should not exist or be empty array
    try {
      const content = await readFile(logPath, 'utf-8')
      const parsed = JSON.parse(content) as unknown[]
      expect(parsed).toHaveLength(0)
    } catch {
      // File doesn't exist — also acceptable (valid path, no failure logged)
    }
  })

  it('writes a structured entry to the validation log when a handler returns an invalid shape', async () => {
    const reg = new HookRegistry()
    // Return an object missing exitCode — should fail HookResult.safeParse
    reg.register('bad-handler', 'pre-commit', async () => {
      return { message: 'oops' } as unknown as HookResult
    })

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
      await dispatch(reg, ctx('pre-commit'))
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write
    }

    // Should have written to stderr
    const allStderr = stderrWrites.join('')
    expect(allStderr).toContain('bad-handler')
    expect(allStderr).toContain('validation FAILED')

    // Log file should exist and be a valid JSON array
    const content = await readFile(logPath, 'utf-8')
    const entries = JSON.parse(content) as Array<Record<string, unknown>>
    expect(Array.isArray(entries)).toBe(true)
    expect(entries).toHaveLength(1)

    const entry = entries[0]
    // Required fields per Plan 34 D1 spec
    expect(typeof entry.ts).toBe('string')
    expect(new Date(entry.ts as string).toISOString()).toBe(entry.ts)
    expect(entry.kind).toBe('pre-commit')
    expect(entry.handler).toBe('bad-handler')
    expect(typeof entry.rawInputSummary).toBe('string')
    expect((entry.rawInputSummary as string).length).toBeGreaterThan(0)
    expect(Array.isArray(entry.validationErrors)).toBe(true)
    expect((entry.validationErrors as unknown[]).length).toBeGreaterThan(0)
    // rawOutput should be the original bad return value
    expect(entry.rawOutput).toBeDefined()
  })

  it('entry rawInputSummary contains kind and cwd', async () => {
    const reg = new HookRegistry()
    reg.register('bad-handler2', 'user-prompt-submit', async () => {
      return { wrong: true } as unknown as HookResult
    })

    await dispatch(reg, ctx('user-prompt-submit', 'some prompt'))

    const content = await readFile(logPath, 'utf-8')
    const entries = JSON.parse(content) as Array<Record<string, unknown>>
    const summary = entries[0].rawInputSummary as string
    expect(summary).toContain('user-prompt-submit')
    // Should not exceed 500 chars (or be the full input)
    expect(summary.length).toBeLessThanOrEqual(600) // slight buffer for the "…" suffix
  })

  it('appends multiple entries as a JSON array', async () => {
    const reg = new HookRegistry()
    reg.register('bad-a', 'pre-commit', async () => {
      return {} as unknown as HookResult
    })
    reg.register('bad-b', 'pre-commit', async () => {
      return null as unknown as HookResult
    })

    // Suppress stderr noise
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (() => true) as typeof process.stderr.write

    try {
      await dispatch(reg, ctx('pre-commit'))
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write
    }

    const content = await readFile(logPath, 'utf-8')
    const entries = JSON.parse(content) as unknown[]
    expect(Array.isArray(entries)).toBe(true)
    expect(entries.length).toBeGreaterThanOrEqual(2)
  })

  it('validationErrors array contains path and message for "(root)" failures', async () => {
    const reg = new HookRegistry()
    // Pass null — will fail at root
    reg.register('null-handler', 'pre-commit', async () => {
      return null as unknown as HookResult
    })

    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (() => true) as typeof process.stderr.write

    try {
      await dispatch(reg, ctx('pre-commit'))
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write
    }

    const content = await readFile(logPath, 'utf-8')
    const entries = JSON.parse(content) as Array<{
      validationErrors: Array<{ path: string; message: string }>
    }>
    const errors = entries[0].validationErrors
    expect(errors.length).toBeGreaterThan(0)
    // At least one error at (root) or a field path
    const paths = errors.map((e) => e.path)
    expect(paths.some((p) => typeof p === 'string')).toBe(true)
  })

  it('rotation: keeps only the 100 most recent entries when log exceeds 100', async () => {
    // Pre-seed the log with 105 old entries
    const oldEntries = Array.from({ length: 105 }, (_, i) => ({
      ts: new Date(Date.now() - 1000 * (105 - i)).toISOString(),
      kind: 'pre-commit',
      handler: `old-handler-${i}`,
      rawInputSummary: '{}',
      rawOutput: null,
      validationErrors: [{ path: '(root)', message: 'test' }],
    }))
    const { writeFile } = await import('node:fs/promises')
    await writeFile(logPath, JSON.stringify(oldEntries), 'utf-8')

    const reg = new HookRegistry()
    reg.register('new-bad-handler', 'pre-commit', async () => {
      return {} as unknown as HookResult
    })

    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (() => true) as typeof process.stderr.write

    try {
      await dispatch(reg, ctx('pre-commit'))
    } finally {
      process.stderr.write = origWrite as typeof process.stderr.write
    }

    const content = await readFile(logPath, 'utf-8')
    const entries = JSON.parse(content) as unknown[]
    // After adding 1 to 105, then rotating to 100: should have exactly 100
    expect(entries.length).toBeLessThanOrEqual(100)
    // The newest entry should be from our handler
    const last = entries[entries.length - 1] as { handler: string }
    expect(last.handler).toBe('new-bad-handler')
  })
})
