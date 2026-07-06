import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { doctorCommand } from '../../src/commands/cli/doctor.js'
import {
  ANVIL_OC_ROUTING_CONTENT,
  OC_ROUTING_MARKER_CLOSE,
  OC_ROUTING_MARKER_OPEN,
} from '../../src/core/routing-rules-content.js'
import { writeAnvilManifest } from '../../src/installer/install.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

/**
 * Integration tests for Plan 33 I2: AGENTS.md doctor row 5-case matrix
 * driven by install target from ~/.anvil/manifest.json.
 *
 * Cases:
 *  1. target=claude-code + AGENTS.md present without marker → skip
 *  2. target=claude-code + AGENTS.md absent → row omitted
 *  3. target=opencode + AGENTS.md with canonical marker → pass
 *  4. target=opencode + AGENTS.md with drifted marker → warn
 *  5. target=opencode + AGENTS.md absent → fail
 */

const ROW_NAME = 'AGENTS.md routing block (OpenCode standing instructions)'

function buildCanonicalBlock(): string {
  return [
    OC_ROUTING_MARKER_OPEN,
    ANVIL_OC_ROUTING_CONTENT.trimEnd(),
    OC_ROUTING_MARKER_CLOSE,
  ].join('\n')
}

describe('integration/doctor-agents-md-cases', () => {
  let tmp: string
  let fakeHome: string
  let projectDir: string
  let origCwd: string
  let origHome: string | undefined

  beforeEach(async () => {
    origCwd = process.cwd()
    origHome = process.env.HOME
    tmp = createTestTmpDir('agents-md')
    fakeHome = join(tmp, 'home')
    projectDir = join(tmp, 'project')
    await mkdir(fakeHome, { recursive: true })
    await mkdir(join(fakeHome, '.anvil'), { recursive: true })
    await mkdir(projectDir, { recursive: true })
    // Make it a "project root" by adding package.json
    await writeFile(
      join(projectDir, 'package.json'),
      '{"name": "test-project"}',
    )
    process.env.HOME = fakeHome
    process.chdir(projectDir)
  })

  afterEach(async () => {
    process.chdir(origCwd)
    if (origHome !== undefined) {
      process.env.HOME = origHome
    } else {
      // biome-ignore lint/performance/noDelete: required to truly unset env var
      delete process.env.HOME
    }
    await rm(tmp, { recursive: true, force: true })
  })

  async function runDoctorJson(): Promise<
    Array<{ name: string; status: string; detail: string }>
  > {
    const chunks: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(),
      )
      return true
    }) as typeof process.stdout.write
    try {
      await doctorCommand({ json: true })
    } catch {
      // doctor may call process.exit
    } finally {
      process.stdout.write = origWrite
    }
    const payload = chunks.join('')
    try {
      return JSON.parse(payload) as Array<{
        name: string
        status: string
        detail: string
      }>
    } catch {
      return []
    }
  }

  it('Case 1: target=claude-code + AGENTS.md present without marker → skip', async () => {
    await writeAnvilManifest(join(fakeHome, '.anvil'), 'claude-code')
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      '# Project Agents\n\nSome project documentation.\n',
    )

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    expect(row?.status).toBe('skip')
    expect(row?.detail).toContain('project-owned')
  })

  it('Case 2: target=claude-code + AGENTS.md absent → row omitted', async () => {
    await writeAnvilManifest(join(fakeHome, '.anvil'), 'claude-code')
    // No AGENTS.md written

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(
      row,
      'AGENTS.md row should be omitted for CC-only with no AGENTS.md',
    ).toBeUndefined()
  })

  it('Case 3: target=opencode + AGENTS.md with canonical marker → pass', async () => {
    await writeAnvilManifest(join(fakeHome, '.anvil'), 'opencode')
    const canonicalBlock = buildCanonicalBlock()
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      `# Agents\n\n${canonicalBlock}\n`,
    )

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    expect(row?.status).toBe('pass')
    expect(row?.detail).toContain('canonical')
  })

  it('Case 4: target=opencode + AGENTS.md with drifted marker → warn', async () => {
    await writeAnvilManifest(join(fakeHome, '.anvil'), 'opencode')
    // Write AGENTS.md with marker but stale content
    const driftedContent = [
      OC_ROUTING_MARKER_OPEN,
      '## Old routing rules — content has drifted from canonical',
      OC_ROUTING_MARKER_CLOSE,
    ].join('\n')
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      `# Agents\n\n${driftedContent}\n`,
    )

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    expect(row?.status).toBe('warn')
    expect(row?.detail).toContain('drifted')
  })

  it('Case 5: target=opencode + AGENTS.md absent → fail', async () => {
    await writeAnvilManifest(join(fakeHome, '.anvil'), 'opencode')
    // No AGENTS.md written

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    expect(row?.status).toBe('fail')
    expect(row?.detail).toContain('AGENTS.md missing')
  })

  it('Case 5b: target=both + AGENTS.md has no marker → fail', async () => {
    await writeAnvilManifest(join(fakeHome, '.anvil'), 'both')
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      '# Project Agents\n\nSome project documentation.\n',
    )

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    expect(row?.status).toBe('fail')
    expect(row?.detail).toContain('no anvil-routing marker block found')
  })

  it('Plan 34 B2: null target + .opencode/ present + AGENTS.md without marker → skip', async () => {
    // The user's exact reported scenario: manifest is absent (pre-v0.9.0 install
    // or missing manifest), .opencode/ exists from a prior tool, but the user
    // only installed --target claude-code. AGENTS.md is project-owned.
    // Expected: doctor returns skip (not fail).
    // No manifest written — installedTarget will be null.
    await mkdir(join(projectDir, '.opencode'), { recursive: true })
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      '# Project Agents\n\nThis is a project-owned AGENTS.md without any anvil marker.\n',
    )

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    expect(row?.status).toBe('skip')
    expect(row?.detail).toContain('project-owned')
  })

  it('Plan 34 B2: null target + AGENTS.md absent → row omitted', async () => {
    // No manifest written — installedTarget will be null.
    // No AGENTS.md — row should be omitted entirely.
    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(
      row,
      'AGENTS.md row should be omitted when manifest absent and AGENTS.md absent',
    ).toBeUndefined()
  })

  it('Plan 34 B2: null target + AGENTS.md WITH marker → drift check runs', async () => {
    // No manifest written — installedTarget will be null.
    // AGENTS.md has the anvil marker → evidence that anvil wrote it.
    // Doctor should perform the drift check (pass when canonical).
    const canonicalBlock = buildCanonicalBlock()
    await writeFile(
      join(projectDir, 'AGENTS.md'),
      `# Agents\n\n${canonicalBlock}\n`,
    )

    const checks = await runDoctorJson()
    const row = checks.find((c) => c.name === ROW_NAME)

    expect(row, 'AGENTS.md row should be present').toBeDefined()
    // Marker present → drift check runs; canonical block → pass.
    expect(row?.status).toBe('pass')
    expect(row?.detail).toContain('canonical')
  })
})
