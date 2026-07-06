import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { doctorCommand } from '../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

/**
 * Plan 34 C6 — integration test for the "Hook latency budget" doctor row.
 *
 * Seeds ~/.anvil/logs/hook-timings.jsonl with synthetic timing data and
 * verifies the doctor row reports correctly:
 *   - pass:  all handlers' p95 < 5s and max < 30s
 *   - warn:  any handler's max >= 5s but < 30s
 *   - fail:  any handler hit the 30s timeout safeguard (timedOut: true)
 */
describe('integration/doctor — Hook latency budget row (Plan 34 C5)', () => {
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

    tmp = createTestTmpDir('doctor-latency')
    fakeHome = join(tmp, 'home')
    anvilHome = join(fakeHome, '.anvil')

    await mkdir(join(anvilHome, 'logs'), { recursive: true })
    logPath = join(anvilHome, 'logs', 'hook-timings.jsonl')

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
    durationMs: number,
    timedOut = false,
    kind = 'stop',
  ): string {
    return JSON.stringify({
      ts: new Date().toISOString(),
      kind,
      handler,
      durationMs,
      exitCode: 0,
      ...(timedOut ? { timedOut: true } : {}),
    })
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

  it('reports pass when all handlers are fast', async () => {
    const lines = [
      makeEntry('stop-handler', 50),
      makeEntry('stop-handler', 60),
      makeEntry('session-end-handler', 100),
    ]
    await writeFile(logPath, `${lines.join('\n')}\n`, 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook latency budget')
    expect(row).toBeDefined()
    expect(row?.status).toBe('pass')
  })

  it('reports warn when a handler max is >= 5s but < 30s', async () => {
    const lines = [
      makeEntry('fast-handler', 100),
      makeEntry('slow-handler', 6000),
      makeEntry('slow-handler', 5500),
    ]
    await writeFile(logPath, `${lines.join('\n')}\n`, 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook latency budget')
    expect(row).toBeDefined()
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain('slow-handler')
  })

  it('reports fail when a handler hit the 30s timeout', async () => {
    const lines = [
      makeEntry('fast-handler', 100),
      makeEntry('timedout-handler', 30000, true),
    ]
    await writeFile(logPath, `${lines.join('\n')}\n`, 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook latency budget')
    expect(row).toBeDefined()
    expect(row?.status).toBe('fail')
    expect(row?.detail).toContain('timedout-handler')
    expect(row?.detail).toContain('TIMED OUT')
  })

  it('shows the 3 slowest handlers in the detail string', async () => {
    const lines = [
      makeEntry('a-handler', 100),
      makeEntry('b-handler', 3000),
      makeEntry('c-handler', 4500),
      makeEntry('d-handler', 2000),
    ]
    await writeFile(logPath, `${lines.join('\n')}\n`, 'utf-8')

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook latency budget')
    expect(row).toBeDefined()
    // The three slowest are c-handler (4.5s), b-handler (3s), d-handler (2s)
    expect(row?.detail).toMatch(/c-handler|b-handler/)
  })

  it('reports skip when no timings log exists', async () => {
    // Don't write the log file — it should not exist
    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === 'Hook latency budget')
    expect(row).toBeDefined()
    expect(row?.status).toBe('skip')
    expect(row?.detail).toMatch(/no data|no hooks|not found/)
  })
})
