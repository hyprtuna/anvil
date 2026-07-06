import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../src/core/config/defaults.js'
import { HookRegistry } from '../../../src/core/registry/hook-registry.js'
import type { HookContext } from '../../../src/core/types.js'
import { dispatch } from '../../../src/hooks/dispatcher.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

/**
 * Plan 34 C6 — dispatcher timing instrumentation tests.
 *
 * Verifies that:
 * 1. Handler durations are appended to ~/.anvil/logs/hook-timings.jsonl
 * 2. Each JSONL entry has the required shape: ts, kind, handler, durationMs, exitCode
 * 3. Log rotation removes entries older than 7 days OR exceeding 10 MB
 */

function ctx(kind: HookContext['kind'] = 'pre-commit'): HookContext {
  return {
    kind,
    cwd: '/tmp',
    config: buildDefaultConfig(),
    env: {},
    payload: null,
  }
}

describe('hooks/dispatcher — timing instrumentation (Plan 34 C1)', () => {
  let tmp: string
  let origHome: string | undefined
  let logPath: string

  beforeEach(async () => {
    tmp = createTestTmpDir('timing')
    origHome = process.env.HOME
    process.env.HOME = tmp
    await mkdir(join(tmp, '.anvil', 'logs'), { recursive: true })
    logPath = join(tmp, '.anvil', 'logs', 'hook-timings.jsonl')
  })

  afterEach(async () => {
    process.env.HOME = origHome
    await rm(tmp, { recursive: true, force: true })
  })

  it('appends a JSONL entry to ~/.anvil/logs/hook-timings.jsonl per handler invocation', async () => {
    const reg = new HookRegistry()
    reg.register('test-handler', 'pre-commit', async () => ({ exitCode: 0 }))

    await dispatch(reg, ctx('pre-commit'))

    const content = await readFile(logPath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    expect(lines.length).toBeGreaterThanOrEqual(1)

    const entry = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>
    expect(entry).toMatchObject({
      kind: 'pre-commit',
      handler: 'test-handler',
      exitCode: 0,
    })
    expect(typeof entry.ts).toBe('string')
    expect(typeof entry.durationMs).toBe('number')
    expect(entry.durationMs).toBeGreaterThanOrEqual(0)
    // ts must be a valid ISO date
    expect(new Date(entry.ts as string).toISOString()).toBe(entry.ts)
  })

  it('logs multiple handlers in order', async () => {
    const reg = new HookRegistry()
    reg.register('handler-a', 'pre-commit', async () => ({ exitCode: 0 }))
    reg.register('handler-b', 'pre-commit', async () => ({
      exitCode: 1,
      message: 'warn',
    }))

    await dispatch(reg, ctx('pre-commit'))

    const content = await readFile(logPath, 'utf-8')
    const entries = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>)

    const relevant = entries.filter((e) => e.kind === 'pre-commit')
    const handlers = relevant.map((e) => e.handler)
    expect(handlers).toContain('handler-a')
    expect(handlers).toContain('handler-b')

    // handler-b returns exitCode 1
    const handlerB = relevant.find((e) => e.handler === 'handler-b')
    expect(handlerB?.exitCode).toBe(1)
  })

  it('creates the log directory if it does not exist', async () => {
    // Remove the log dir to test auto-creation
    await rm(join(tmp, '.anvil', 'logs'), { recursive: true, force: true })

    const reg = new HookRegistry()
    reg.register('create-dir-test', 'pre-commit', async () => ({ exitCode: 0 }))

    await dispatch(reg, ctx('pre-commit'))

    const content = await readFile(logPath, 'utf-8')
    expect(content.trim()).toBeTruthy()
  })

  it('rotation removes entries older than 7 days', async () => {
    // Write old entries (>7 days ago) and new entries
    const sevenDaysAgoMs = Date.now() - 8 * 24 * 60 * 60 * 1000
    const oldEntry = JSON.stringify({
      ts: new Date(sevenDaysAgoMs).toISOString(),
      kind: 'stop',
      handler: 'old-handler',
      durationMs: 100,
      exitCode: 0,
    })
    const recentEntry = JSON.stringify({
      ts: new Date(Date.now() - 1000).toISOString(),
      kind: 'stop',
      handler: 'recent-handler',
      durationMs: 50,
      exitCode: 0,
    })
    await writeFile(logPath, `${oldEntry}\n${recentEntry}\n`, 'utf-8')

    const reg = new HookRegistry()
    reg.register('new-handler', 'pre-commit', async () => ({ exitCode: 0 }))

    // Dispatch triggers rotation check
    await dispatch(reg, ctx('pre-commit'))

    const content = await readFile(logPath, 'utf-8')
    const entries = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Record<string, unknown>)

    const handlers = entries.map((e) => e.handler)
    expect(handlers).not.toContain('old-handler')
    expect(handlers).toContain('recent-handler')
    expect(handlers).toContain('new-handler')
  })

  it('rotation removes entries when file exceeds 10 MB (keeps recent)', async () => {
    // Write a 11MB file filled with old entries to simulate size-based rotation
    const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    // Each line ~100 bytes; 11MB ~= 110,000 lines
    const singleLine = `${JSON.stringify({
      ts: oldDate,
      kind: 'stop',
      handler: 'bulk-old',
      durationMs: 1,
      exitCode: 0,
    })}\n`
    // Write enough to exceed 10MB (10 * 1024 * 1024 = 10,485,760 bytes)
    const targetSize = 11 * 1024 * 1024
    let content = ''
    while (content.length < targetSize) {
      content += singleLine
    }
    // Append one recent entry
    const recentLine = `${JSON.stringify({
      ts: new Date().toISOString(),
      kind: 'stop',
      handler: 'recent-only',
      durationMs: 5,
      exitCode: 0,
    })}\n`
    await writeFile(logPath, content + recentLine, 'utf-8')

    const reg = new HookRegistry()
    reg.register('post-rotation', 'pre-commit', async () => ({ exitCode: 0 }))

    await dispatch(reg, ctx('pre-commit'))

    const afterContent = await readFile(logPath, 'utf-8')
    const afterStat = await stat(logPath)
    // File must be smaller than 10MB after rotation
    expect(afterStat.size).toBeLessThan(10 * 1024 * 1024)
    // Recent and new entries must survive
    expect(afterContent).toContain('recent-only')
    expect(afterContent).toContain('post-rotation')
    // Old bulk entries should be gone
    expect(afterContent).not.toContain('bulk-old')
  }, 30_000)
})
