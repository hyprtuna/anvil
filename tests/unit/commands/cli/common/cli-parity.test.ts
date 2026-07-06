import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SUBCOMMAND_SLASHES,
  auditCliSlashParity,
} from '../../../../../src/commands/cli/common/cli-parity.js'

// ---------------------------------------------------------------------------
// Test fixtures setup helpers
// ---------------------------------------------------------------------------

let slashDir: string
let cliDir: string

beforeEach(async () => {
  const base = join(tmpdir(), `anvil-parity-${Date.now()}`)
  slashDir = join(base, 'slash')
  cliDir = join(base, 'cli')
  await mkdir(slashDir, { recursive: true })
  await mkdir(cliDir, { recursive: true })
})

afterEach(async () => {
  const base = join(slashDir, '..')
  await rm(base, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// SUBCOMMAND_SLASHES export
// ---------------------------------------------------------------------------

describe('SUBCOMMAND_SLASHES', () => {
  it('is non-empty and contains expected entries', () => {
    expect(Object.keys(SUBCOMMAND_SLASHES).length).toBeGreaterThan(0)
    expect(SUBCOMMAND_SLASHES['anvil-init']).toBe('init.ts')
    expect(SUBCOMMAND_SLASHES['new-skill']).toBe('skill.ts')
    expect(SUBCOMMAND_SLASHES['skill-search']).toBe('skill.ts')
  })
})

// ---------------------------------------------------------------------------
// auditCliSlashParity — happy path
// ---------------------------------------------------------------------------

describe('auditCliSlashParity — full parity', () => {
  it('returns empty issues when all slash files match CLI files and include anvil invocation', async () => {
    // Two matched pairs
    await writeFile(
      join(slashDir, 'debug.md'),
      '---\nname: debug\ndescription: debug\n---\nRun `anvil debug`\n',
    )
    await writeFile(
      join(slashDir, 'plan.md'),
      '---\nname: plan\ndescription: plan\n---\nRun `anvil plan`\n',
    )
    await writeFile(join(cliDir, 'debug.ts'), 'export {}')
    await writeFile(join(cliDir, 'plan.ts'), 'export {}')

    const report = await auditCliSlashParity({ slashDir, cliDir })

    expect(report.issues).toEqual([])
    expect(report.checkedSlashCount).toBe(2)
  })

  it('handles subcommand map entries correctly', async () => {
    // A slash that maps to a different CLI file via subcommandMap
    await writeFile(
      join(slashDir, 'new-skill.md'),
      '---\nname: new-skill\ndescription: create a skill\n---\nRun `anvil skill new`\n',
    )
    await writeFile(join(cliDir, 'skill.ts'), 'export {}')

    const report = await auditCliSlashParity({
      slashDir,
      cliDir,
      subcommandMap: { 'new-skill': 'skill.ts' },
    })

    expect(report.issues).toEqual([])
    expect(report.checkedSlashCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// auditCliSlashParity — missing-cli
// ---------------------------------------------------------------------------

describe('auditCliSlashParity — missing-cli', () => {
  it('reports missing-cli when slash file has no CLI counterpart', async () => {
    await writeFile(
      join(slashDir, 'orphan.md'),
      '---\nname: orphan\ndescription: orphan\n---\nRun `anvil orphan`\n',
    )
    // No CLI file written

    const report = await auditCliSlashParity({ slashDir, cliDir })

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].kind).toBe('missing-cli')
    expect(report.issues[0].slash).toBe('orphan.md')
    expect(report.issues[0].detail).toContain('/orphan')
    expect(report.issues[0].detail).toContain('orphan.ts')
  })

  it('does not also report missing-invocation for a slash with no CLI file', async () => {
    await writeFile(
      join(slashDir, 'ghost.md'),
      '---\nname: ghost\ndescription: ghost\n---\nNo anvil invocation here.\n',
    )
    // No CLI file — missing-cli takes priority; missing-invocation is skipped

    const report = await auditCliSlashParity({ slashDir, cliDir })

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].kind).toBe('missing-cli')
  })
})

// ---------------------------------------------------------------------------
// auditCliSlashParity — missing-invocation
// ---------------------------------------------------------------------------

describe('auditCliSlashParity — missing-invocation', () => {
  it('reports missing-invocation when slash body lacks anvil <cmd>', async () => {
    await writeFile(
      join(slashDir, 'silent.md'),
      '---\nname: silent\ndescription: silent\n---\nThis slash does not mention the CLI.\n',
    )
    await writeFile(join(cliDir, 'silent.ts'), 'export {}')

    const report = await auditCliSlashParity({ slashDir, cliDir })

    expect(report.issues).toHaveLength(1)
    expect(report.issues[0].kind).toBe('missing-invocation')
    expect(report.issues[0].slash).toBe('silent.md')
    expect(report.issues[0].detail).toContain('/silent')
  })
})

// ---------------------------------------------------------------------------
// auditCliSlashParity — edge cases
// ---------------------------------------------------------------------------

describe('auditCliSlashParity — edge cases', () => {
  it('returns zero count and no issues when slashDir does not exist', async () => {
    const report = await auditCliSlashParity({
      slashDir: '/tmp/anvil-nonexistent-slash-dir-xyz',
      cliDir,
    })
    expect(report.checkedSlashCount).toBe(0)
    expect(report.issues).toEqual([])
  })

  it('ignores non-.md files in slashDir', async () => {
    await writeFile(join(slashDir, 'README.txt'), 'not a slash command')
    await writeFile(join(slashDir, 'config.json'), '{}')

    const report = await auditCliSlashParity({ slashDir, cliDir })

    expect(report.checkedSlashCount).toBe(0)
    expect(report.issues).toEqual([])
  })

  it('uses default SUBCOMMAND_SLASHES when no override provided', async () => {
    // skill-search maps to skill.ts via default map
    await writeFile(
      join(slashDir, 'skill-search.md'),
      '---\nname: skill-search\ndescription: search\n---\nRun `anvil skill search <query>`\n',
    )
    await writeFile(join(cliDir, 'skill.ts'), 'export {}')

    const report = await auditCliSlashParity({ slashDir, cliDir })

    expect(report.issues).toEqual([])
  })
})
