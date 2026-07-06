import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { doctorCommand } from '../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

/**
 * Plan 34 D5 — integration test for the "Hook output validation" doctor row.
 *
 * Seeds ~/.anvil/logs/hook-validation-failures.json with synthetic failure
 * entries and verifies the doctor row reports correctly:
 *   - pass:  0 failures in past 24h
 *   - warn:  1–5 failures in past 24h
 *   - fail:  6+ failures in past 24h (chronic)
 *
 * Also verifies that old entries (> 24h) are excluded from the count.
 */
describe('integration/doctor — Hook output validation row (Plan 34 D5)', () => {
  let tmp: string
  let fakeHome: string
  let anvilHome: string
  let logPath: string
  let origHome: string | undefined
  let origCwd: string
  let writes: string[]
  let origWrite: typeof process.stdout.write

  beforeEach(async () => {
    origCwd = process.cwd()
    origHome = process.env.HOME

    tmp = createTestTmpDir('doctor-d5')
    fakeHome = join(tmp, 'home')
    anvilHome = join(fakeHome, '.anvil')

    await mkdir(join(anvilHome, 'logs'), { recursive: true })
    logPath = join(anvilHome, 'logs', 'hook-validation-failures.json')

    // Create ~/.anvil/version so doctor's version check passes
    await writeFile(join(anvilHome, 'version'), '0.9.1', 'utf-8')

    process.env.HOME = fakeHome

    // Use a non-project cwd so project-only rows are skipped cleanly
    const nonProjectDir = join(tmp, 'nonproject')
    await mkdir(nonProjectDir, { recursive: true })
    process.chdir(nonProjectDir)

    writes = []
    origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      writes.push(
        typeof chunk === 'string'
          ? chunk
          : Buffer.from(chunk).toString('utf-8'),
      )
      return true
    }) as typeof process.stdout.write
  })

  afterEach(async () => {
    process.env.HOME = origHome
    process.stdout.write = origWrite
    process.chdir(origCwd)
    await rm(tmp, { recursive: true, force: true })
  })

  function makeEntry(
    handler: string,
    kind: string,
    ageMs = 0,
  ): {
    ts: string
    kind: string
    handler: string
    rawInputSummary: string
    rawOutput: null
    validationErrors: Array<{ path: string; message: string }>
  } {
    return {
      ts: new Date(Date.now() - ageMs).toISOString(),
      kind,
      handler,
      rawInputSummary: '{"kind":"user-prompt-submit","cwd":"/tmp"}',
      rawOutput: null,
      validationErrors: [{ path: '(root)', message: 'Invalid input' }],
    }
  }

  async function runDoctorJson(): Promise<
    Array<{ name: string; status: string; detail: string }>
  > {
    await doctorCommand({ fix: false, json: true })
    const payload = writes.join('')
    return JSON.parse(payload) as Array<{
      name: string
      status: string
      detail: string
    }>
  }

  it('reports pass when no log file exists (0 failures)', async () => {
    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row).toBeDefined()
    expect(row?.status).toBe('pass')
    expect(row?.detail).toContain('0 failures')
  })

  it('reports pass when log file exists but all entries are older than 24h', async () => {
    const oldMs = 25 * 60 * 60 * 1000 // 25 hours ago
    const entries = [
      makeEntry('old-handler', 'user-prompt-submit', oldMs),
      makeEntry('old-handler', 'user-prompt-submit', oldMs + 1000),
    ]
    await writeFile(logPath, JSON.stringify(entries), 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row).toBeDefined()
    expect(row?.status).toBe('pass')
  })

  it('reports warn when 1–5 failures exist in the past 24h', async () => {
    const entries = [
      makeEntry('ups-handler', 'user-prompt-submit', 0),
      makeEntry('ups-handler', 'user-prompt-submit', 1000),
      makeEntry('ups-handler', 'user-prompt-submit', 2000),
    ]
    await writeFile(logPath, JSON.stringify(entries), 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row).toBeDefined()
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain('3 failure')
    // Should surface the most recent handler
    expect(row?.detail).toContain('ups-handler')
  })

  it('reports warn for exactly 5 failures (boundary)', async () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry('boundary-handler', 'user-prompt-submit', i * 1000),
    )
    await writeFile(logPath, JSON.stringify(entries), 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row?.status).toBe('warn')
  })

  it('reports fail when 6+ failures exist in the past 24h (chronic)', async () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry('chronic-handler', 'user-prompt-submit', i * 1000),
    )
    await writeFile(logPath, JSON.stringify(entries), 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row).toBeDefined()
    expect(row?.status).toBe('fail')
    expect(row?.detail).toContain('8 hook validation')
    // Should surface the most recent handler
    expect(row?.detail).toContain('chronic-handler')
  })

  it('mix of old and recent: only counts recent entries', async () => {
    const oldMs = 26 * 60 * 60 * 1000
    const entries = [
      // 5 old (>24h) — should not count
      ...Array.from({ length: 5 }, () =>
        makeEntry('old-handler', 'user-prompt-submit', oldMs),
      ),
      // 3 recent — should count → warn
      makeEntry('recent-handler', 'user-prompt-submit', 0),
      makeEntry('recent-handler', 'user-prompt-submit', 1000),
      makeEntry('recent-handler', 'user-prompt-submit', 2000),
    ]
    await writeFile(logPath, JSON.stringify(entries), 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain('3 failure')
    expect(row?.detail).toContain('recent-handler')
  })

  it('detail string includes most-recent failure info for fail status', async () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry(`handler-${i}`, 'user-prompt-submit', i * 100),
    )
    await writeFile(logPath, JSON.stringify(entries), 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook output validation')
    expect(row?.status).toBe('fail')
    // The doctor surfaces the last entry in the array (handler-7, ageMs=700ms)
    // because it reads entries in array order and picks entries[length-1].
    expect(row?.detail).toContain('handler-7')
  })
})
