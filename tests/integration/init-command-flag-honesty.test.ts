/**
 * Regression test — ANV-0011: --from-git / --from-archive must NOT be
 * advertised or parseable by the install driver.
 *
 * Acceptance criteria tested:
 *   1. buildContextFromRepo with sourceKind='git' throws "not implemented".
 *   2. buildContextFromRepo with sourceKind='archive' throws "not implemented".
 *   3. The install-driver source (src/installer/cli.ts) does not declare
 *      'from-git' or 'from-archive' in its parseArgs options block.
 *   4. The install.sh wrapper does not list --from-git or --from-archive
 *      in its DRIVER_FLAGS array (preventing MODE=driver detection).
 *   5. docs/installation.md does not advertise the flags in its source-
 *      options table.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildContextFromRepo } from '../../src/installer/context-from-repo.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

// ── 1 & 2: buildContextFromRepo still throws for unimplemented source kinds ──

describe('init-command-flag-honesty: buildContextFromRepo', () => {
  it('throws "not implemented" for sourceKind=git', async () => {
    await expect(
      buildContextFromRepo({
        sourceKind: 'git',
        sourceValue: 'https://example.com/anvil.git',
      }),
    ).rejects.toThrow(/not yet implemented/)
  })

  it('throws "not implemented" for sourceKind=archive', async () => {
    await expect(
      buildContextFromRepo({
        sourceKind: 'archive',
        sourceValue: 'https://example.com/anvil.tar.gz',
      }),
    ).rejects.toThrow(/not yet implemented/)
  })
})

// ── 3: install-driver source does NOT declare from-git / from-archive ────────

describe('init-command-flag-honesty: src/installer/cli.ts', () => {
  const cliSource = readFileSync(
    join(ROOT, 'src', 'installer', 'cli.ts'),
    'utf-8',
  )

  it('does not declare from-git as a parseArgs option', () => {
    // Match an active option declaration (not a comment)
    // The comment acknowledging the omission is allowed; an active key is not.
    const activeDeclaration = /^\s*'from-git'\s*:\s*\{/m
    expect(activeDeclaration.test(cliSource)).toBe(false)
  })

  it('does not declare from-archive as a parseArgs option', () => {
    const activeDeclaration = /^\s*'from-archive'\s*:\s*\{/m
    expect(activeDeclaration.test(cliSource)).toBe(false)
  })
})

// ── 4: install.sh DRIVER_FLAGS does not contain --from-git / --from-archive ──

describe('init-command-flag-honesty: install.sh', () => {
  const installSh = readFileSync(join(ROOT, 'install.sh'), 'utf-8')

  it('does not include --from-git in DRIVER_FLAGS', () => {
    // The DRIVER_FLAGS array drives mode-detection in install.sh.
    // Presence here would cause MODE=driver and forward the flag to the driver.
    const driverFlagsBlock = installSh.match(/DRIVER_FLAGS=\([^)]+\)/)
    expect(driverFlagsBlock).not.toBeNull()
    expect(driverFlagsBlock![0]).not.toContain('--from-git')
  })

  it('does not include --from-archive in DRIVER_FLAGS', () => {
    const driverFlagsBlock = installSh.match(/DRIVER_FLAGS=\([^)]+\)/)
    expect(driverFlagsBlock).not.toBeNull()
    expect(driverFlagsBlock![0]).not.toContain('--from-archive')
  })
})

// ── 5: docs/installation.md source-options table does not advertise flags ────

describe('init-command-flag-honesty: docs/installation.md', () => {
  const installDoc = readFileSync(
    join(ROOT, 'docs', 'installation.md'),
    'utf-8',
  )

  it('does not list --from-git in source-options table', () => {
    // A markdown table cell containing --from-git would advertise it as supported.
    const tableCell = /\|\s*`--from-git/
    expect(tableCell.test(installDoc)).toBe(false)
  })

  it('does not list --from-archive in source-options table', () => {
    const tableCell = /\|\s*`--from-archive/
    expect(tableCell.test(installDoc)).toBe(false)
  })
})
