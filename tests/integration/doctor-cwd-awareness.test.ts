import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { doctorCommand } from '../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

/**
 * Integration: doctor rows that target project files should return `skip`
 * when cwd is not a project root (no package.json / .git / etc.), and
 * should run (not skip) when cwd contains a project root marker.
 *
 * Plan 33 H4
 */
describe('integration/doctor-cwd-awareness', () => {
  let tmp: string
  let origCwd: string
  let origHome: string | undefined
  let fakeHome: string

  beforeEach(async () => {
    origCwd = process.cwd()
    origHome = process.env.HOME
    tmp = createTestTmpDir('cwd-awareness')
    fakeHome = join(tmp, 'home')
    await mkdir(fakeHome, { recursive: true })
    await mkdir(join(fakeHome, '.anvil'), { recursive: true })
    process.env.HOME = fakeHome
  })

  afterEach(async () => {
    process.chdir(origCwd)
    if (origHome !== undefined) {
      process.env.HOME = origHome
    } else {
      // biome-ignore lint/performance/noDelete: delete is required to truly unset env var
      delete process.env.HOME
    }
    await rm(tmp, { recursive: true, force: true })
  })

  type DoctorJsonRow = {
    name: string
    status: string
    detail: string
    expectedAbsence?: boolean
  }

  async function runDoctorJson(
    extraOpts?: Record<string, unknown>,
  ): Promise<DoctorJsonRow[]> {
    const chunks: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return true
    }) as typeof process.stdout.write
    try {
      await doctorCommand({ json: true, ...extraOpts })
    } catch {
      // doctor may call process.exit
    } finally {
      process.stdout.write = origWrite
    }
    const payload = chunks.join('')
    try {
      return JSON.parse(payload) as DoctorJsonRow[]
    } catch {
      return []
    }
  }

  const PROJECT_SPECIFIC_ROWS = [
    'CC project wiring (.claude/settings.json)',
    'CC statusline wiring (.claude/settings.json → statusLine)',
    'CC settings template (.claude/settings.json)',
    'OC project wiring (.opencode/opencode.json)',
  ]

  it('project-specific rows are skipped when cwd has no project markers', async () => {
    const noProjectDir = join(tmp, 'not-a-project')
    await mkdir(noProjectDir, { recursive: true })
    process.chdir(noProjectDir)

    const checks = await runDoctorJson()
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]))

    for (const rowName of PROJECT_SPECIFIC_ROWS) {
      const row = byName[rowName]
      if (row !== undefined) {
        expect(
          row.status,
          `Expected '${rowName}' to be 'skip' from non-project dir, got '${row.status}'`,
        ).toBe('skip')
        expect(row.detail).toContain('not in a project root')
      }
    }
  })

  it('project-specific rows run when cwd contains package.json', async () => {
    const projectDir = join(tmp, 'my-project')
    await mkdir(projectDir, { recursive: true })
    await writeFile(join(projectDir, 'package.json'), '{"name": "test"}')
    process.chdir(projectDir)

    const checks = await runDoctorJson()
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]))

    // These rows must not be unconditional skips (status=skip without
    // expectedAbsence=true). A skip+expectedAbsence=true row is also acceptable
    // — it means the row ran, determined the check is not applicable for this
    // install scope (e.g. global-only install in a project dir), and will be
    // suppressed in quiet mode. That is correct ANV-0146 behaviour.
    // (The plain SKIP_DETAIL skip only happens when inProject===false, which
    // cannot be the case here since package.json is present.)
    for (const rowName of PROJECT_SPECIFIC_ROWS) {
      const row = byName[rowName]
      if (row !== undefined) {
        const isUnconditionalSkip =
          row.status === 'skip' && row.expectedAbsence !== true
        expect(
          isUnconditionalSkip,
          `'${rowName}' should not be an unconditional skip from project dir (got status='${row.status}', expectedAbsence=${row.expectedAbsence})`,
        ).toBe(false)
      }
    }
  })

  it('project-specific rows run when cwd contains .git directory', async () => {
    const projectDir = join(tmp, 'git-project')
    await mkdir(projectDir, { recursive: true })
    await mkdir(join(projectDir, '.git'), { recursive: true })
    process.chdir(projectDir)

    const checks = await runDoctorJson()
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]))

    // Same contract as the package.json test: skip+expectedAbsence=true is
    // acceptable (ANV-0146 global-only suppression); unconditional skip is not.
    for (const rowName of PROJECT_SPECIFIC_ROWS) {
      const row = byName[rowName]
      if (row !== undefined) {
        const isUnconditionalSkip =
          row.status === 'skip' && row.expectedAbsence !== true
        expect(
          isUnconditionalSkip,
          `'${rowName}' should not be an unconditional skip from .git dir (got status='${row.status}', expectedAbsence=${row.expectedAbsence})`,
        ).toBe(false)
      }
    }
  })

  it('skipped rows include a helpful detail message', async () => {
    const noProjectDir = join(tmp, 'empty-dir')
    await mkdir(noProjectDir, { recursive: true })
    process.chdir(noProjectDir)

    const checks = await runDoctorJson()
    const skipped = checks.filter((c) => c.status === 'skip')

    // At least the project-specific rows should appear as skipped
    expect(skipped.length).toBeGreaterThan(0)

    // Project-specific rows say "not in a project root"; registry rows (Plan 34 B3)
    // say "no skills/ tree in cwd" or "no agents/ tree in cwd". Both are valid skip
    // detail strings — just verify every skipped row has a non-empty detail.
    for (const row of skipped) {
      expect(
        row.detail.length,
        `'${row.name}' skip detail should be non-empty`,
      ).toBeGreaterThan(0)
    }
  })

  it('skill registry and agent runtime precondition rows render skip (not warn) from non-project cwd', async () => {
    // Plan 34 B3: these two rows previously emitted warn from a non-project cwd.
    const noProjectDir = join(tmp, 'non-project-b3')
    await mkdir(noProjectDir, { recursive: true })
    process.chdir(noProjectDir)

    const checks = await runDoctorJson()
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]))

    const registryRow = byName['skill registry health']
    const agentRow = byName['agent runtime preconditions']

    if (registryRow !== undefined) {
      expect(
        registryRow.status,
        `'skill registry health' should be 'skip' from non-project cwd, got '${registryRow.status}'`,
      ).toBe('skip')
    }

    if (agentRow !== undefined) {
      expect(
        agentRow.status,
        `'agent runtime preconditions' should be 'skip' from non-project cwd, got '${agentRow.status}'`,
      ).toBe('skip')
    }
  })
})
