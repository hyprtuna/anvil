import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pushTierIntegrityCheck } from '../../src/commands/cli/doctor-checks/skill-checks.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

/**
 * Plan 38 Phase F — integration test for the `Tier integrity` check.
 *
 * ANV-0185: Tier integrity was migrated from `anvil doctor` to `npm run dev:doctor`.
 * Tests now call `pushTierIntegrityCheck` directly rather than via `doctorCommand`.
 */
describe('integration/doctor-tier-integrity', () => {
  let tmp: string
  let fakeHome: string
  let anvilHome: string
  let projectRoot: string
  let origCwd: string
  let origHome: string | undefined

  beforeEach(async () => {
    origCwd = process.cwd()
    origHome = process.env.HOME

    tmp = createTestTmpDir('tier-integ')
    fakeHome = join(tmp, 'home')
    projectRoot = join(tmp, 'project')
    anvilHome = join(fakeHome, '.anvil')

    await mkdir(fakeHome, { recursive: true })
    await mkdir(projectRoot, { recursive: true })
    await mkdir(anvilHome, { recursive: true })
    // isProjectRoot requires .git or package.json
    await mkdir(join(projectRoot, '.git'), { recursive: true })

    process.env.HOME = fakeHome
    process.chdir(projectRoot)
  })

  afterEach(async () => {
    process.chdir(origCwd)
    if (origHome !== undefined) {
      process.env.HOME = origHome
    } else {
      // biome-ignore lint/performance/noDelete: process.env.HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
      delete process.env.HOME
    }
    await rm(tmp, { recursive: true, force: true })
  })

  /** Helper: run pushTierIntegrityCheck against the current projectRoot. */
  async function runTierCheck(): Promise<
    Array<{ name: string; status: string; detail: string }>
  > {
    const rows: Array<{ name: string; status: string; detail: string }> = []
    await pushTierIntegrityCheck(
      rows as Parameters<typeof pushTierIntegrityCheck>[0],
      projectRoot,
      anvilHome,
      true,
      'not in project',
    )
    return rows
  }

  it('reports "Tier integrity: skip" when run from a directory with no agents/ tree', async () => {
    // No agents/ dir in projectRoot → skip-eligible
    const rows = await runTierCheck()
    const tierRow = rows.find((c) => c.name === 'Tier integrity')
    expect(tierRow, 'Tier integrity row must be present').toBeDefined()
    expect(tierRow?.status).toBe('skip')
  })

  it('reports "Tier integrity: pass" when agents/ has only valid tier names', async () => {
    // Create a minimal agents/ directory with a single valid agent
    const agentsDir = join(projectRoot, 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(
      join(agentsDir, 'my-agent.md'),
      [
        '---',
        'name: my-agent',
        'description: Test agent',
        'tier: coding',
        '---',
        '',
        '# My Agent',
      ].join('\n'),
    )

    const rows = await runTierCheck()
    const tierRow = rows.find((c) => c.name === 'Tier integrity')
    expect(tierRow, 'Tier integrity row must be present').toBeDefined()
    expect(tierRow?.status).toBe('pass')
    expect(tierRow?.detail).toContain('name validity: pass')
    expect(tierRow?.detail).toContain('migration: pass')
  })

  it('reports "Tier integrity: fail" when an agent uses a legacy tier name', async () => {
    // Create agents/ dir with an agent using legacy 'standard' tier
    const agentsDir = join(projectRoot, 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(
      join(agentsDir, 'old-agent.md'),
      [
        '---',
        'name: old-agent',
        'description: Legacy tier agent',
        'tier: standard',
        '---',
        '',
        '# Old Agent',
      ].join('\n'),
    )

    const rows = await runTierCheck()
    const tierRow = rows.find((c) => c.name === 'Tier integrity')
    expect(tierRow, 'Tier integrity row must be present').toBeDefined()
    expect(tierRow?.status).toBe('fail')
    expect(tierRow?.detail).toContain('name validity: fail')
    expect(tierRow?.detail).toContain('old-agent')
  })

  it('includes all 4 sub-check labels in the detail string', async () => {
    const agentsDir = join(projectRoot, 'agents')
    await mkdir(agentsDir, { recursive: true })
    await writeFile(
      join(agentsDir, 'agent-ok.md'),
      [
        '---',
        'name: agent-ok',
        'description: OK agent',
        'tier: planning',
        '---',
      ].join('\n'),
    )

    const rows = await runTierCheck()
    const tierRow = rows.find((c) => c.name === 'Tier integrity')
    expect(tierRow?.detail).toContain('name validity:')
    expect(tierRow?.detail).toContain('effort/model compat:')
    expect(tierRow?.detail).toContain('migration:')
    expect(tierRow?.detail).toContain('stale install:')
  })
})
