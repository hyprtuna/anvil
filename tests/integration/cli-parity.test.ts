import { mkdir, rm, writeFile } from 'node:fs/promises'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { describe, expect, it } from 'vitest'
import {
  SLASH_ONLY_COMMANDS,
  SUBCOMMAND_SLASHES,
  auditCliSlashParity,
} from '../../src/commands/cli/common/cli-parity.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SLASH_DIR = join(__dirname, '..', '..', 'src', 'commands', 'slash')
const CLI_DIR = join(__dirname, '..', '..', 'src', 'commands', 'cli')

describe('integration: CLI ↔ slash parity', () => {
  it('every slash command has a CLI counterpart and references anvil <cmd>', async () => {
    const report = await auditCliSlashParity({
      slashDir: SLASH_DIR,
      cliDir: CLI_DIR,
    })
    expect(
      report.issues,
      `parity issues: ${report.issues.map((i) => i.detail).join('; ')}`,
    ).toEqual([])
    expect(report.checkedSlashCount).toBeGreaterThan(0)
  })

  it('every slash command has valid frontmatter (name + description)', async () => {
    const slashes = (await readdir(SLASH_DIR)).filter((f) => f.endsWith('.md'))
    for (const slash of slashes) {
      const raw = await readFile(join(SLASH_DIR, slash), 'utf-8')
      const parsed = matter(raw)
      expect(parsed.data.name, `${slash}: missing name`).toBeTruthy()
      expect(
        parsed.data.description,
        `${slash}: missing description`,
      ).toBeTruthy()
    }
  })

  it('SUBCOMMAND_SLASHES map is exported from the helper (single source of truth)', () => {
    // Verify the map is non-empty and contains expected entries
    expect(Object.keys(SUBCOMMAND_SLASHES).length).toBeGreaterThan(0)
    expect(SUBCOMMAND_SLASHES['anvil-init']).toBe('init.ts')
    expect(SUBCOMMAND_SLASHES['skill-search']).toBe('skill.ts')
  })

  it('SLASH_ONLY_COMMANDS is exported and contains agents (Plan 34 B1)', () => {
    expect(SLASH_ONLY_COMMANDS).toBeInstanceOf(Set)
    expect(SLASH_ONLY_COMMANDS.has('agents')).toBe(true)
  })

  it('SLASH_ONLY_COMMANDS exclusion: slash in set produces no parity issues even without CLI counterpart', async () => {
    // Plan 34 B1: a slash file whose stem is in SLASH_ONLY_COMMANDS should
    // produce zero issues, even when the corresponding CLI file is absent.
    const tmp = createTestTmpDir('parity')
    try {
      const slashDir = join(tmp, 'slash')
      const cliDir = join(tmp, 'cli')
      await mkdir(slashDir)
      await mkdir(cliDir)

      // Write a slash file for 'agents' (in SLASH_ONLY_COMMANDS) — no matching CLI file
      await writeFile(
        join(slashDir, 'agents.md'),
        '---\nname: agents\ndescription: test\n---\n\n`anvil agents <task>`\n',
      )

      const report = await auditCliSlashParity({
        slashDir,
        cliDir,
        // use the real SLASH_ONLY_COMMANDS
        slashOnlyCommands: SLASH_ONLY_COMMANDS,
      })

      expect(report.checkedSlashCount).toBe(1)
      expect(report.issues).toHaveLength(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('SLASH_ONLY_COMMANDS exclusion: slash NOT in set still fails parity check when CLI absent', async () => {
    // Sanity check: a slash file whose stem is NOT in SLASH_ONLY_COMMANDS still
    // triggers a missing-cli issue when the CLI file is absent.
    const tmp = createTestTmpDir('parity-non-excluded')
    try {
      const slashDir = join(tmp, 'slash')
      const cliDir = join(tmp, 'cli')
      await mkdir(slashDir)
      await mkdir(cliDir)

      // Write a slash file for 'nonexistent' (NOT in SLASH_ONLY_COMMANDS)
      await writeFile(
        join(slashDir, 'nonexistent.md'),
        '---\nname: nonexistent\ndescription: test\n---\n\n`anvil nonexistent`\n',
      )

      const report = await auditCliSlashParity({
        slashDir,
        cliDir,
        slashOnlyCommands: SLASH_ONLY_COMMANDS,
      })

      expect(report.issues.length).toBeGreaterThan(0)
      expect(report.issues[0].kind).toBe('missing-cli')
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  it('.js CLI files are accepted as counterparts (installed bundle case, Plan 34 B1)', async () => {
    // When running from the installed bundle, the CLI dir contains .js files,
    // not .ts files. The parity check should accept .js as a valid counterpart.
    const tmp = createTestTmpDir('parity-js')
    try {
      const slashDir = join(tmp, 'slash')
      const cliDir = join(tmp, 'cli')
      await mkdir(slashDir)
      await mkdir(cliDir)

      // Write a slash file for 'debug' and a .js CLI file (no .ts)
      await writeFile(
        join(slashDir, 'debug.md'),
        '---\nname: debug\ndescription: test\n---\n\n`anvil debug`\n',
      )
      await writeFile(join(cliDir, 'debug.js'), '// compiled CLI\n')

      const report = await auditCliSlashParity({
        slashDir,
        cliDir,
      })

      expect(report.issues).toHaveLength(0)
    } finally {
      await rm(tmp, { recursive: true, force: true })
    }
  })

  // Plan 38 Phase D — --tier flag slash-command parity
  describe('--tier flag documented in slash counterparts (Plan 38 Phase D)', () => {
    // ANV-0249: 'spec' removed — anvil spec CLI deleted; SDD is /sdd-workflow skill
    const TIER_COMMANDS = ['review', 'plan', 'debug', 'ultra'] as const

    for (const cmd of TIER_COMMANDS) {
      it(`${cmd}.md slash command documents --tier`, async () => {
        const raw = await readFile(join(SLASH_DIR, `${cmd}.md`), 'utf-8')
        expect(
          raw,
          `${cmd}.md should document --tier flag (Plan 38 Phase D)`,
        ).toContain('--tier')
      })
    }

    it('review.md documents --tier in the Equivalent CLI line', async () => {
      const raw = await readFile(join(SLASH_DIR, 'review.md'), 'utf-8')
      const lines = raw.split('\n')
      const cliLine = lines.find(
        (l) => l.includes('anvil') && l.includes('review'),
      )
      expect(
        cliLine,
        'review.md should have an anvil review CLI example',
      ).toBeTruthy()
      expect(cliLine).toContain('--tier')
    })

    it('ultra.md documents the --model wins over --tier conflict rule', async () => {
      const raw = await readFile(join(SLASH_DIR, 'ultra.md'), 'utf-8')
      // Must mention both --tier and the conflict resolution
      expect(raw).toContain('--tier')
      expect(raw).toContain('--model')
    })
  })
})
