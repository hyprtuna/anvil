import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { runUninstall } from '../../src/installer/uninstall.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const ANVIL_BIN = join(process.cwd(), 'bin', 'anvil.cjs')

describe('anvil uninstall --archive', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('cli-archive')
  })

  function seedAnvilHome(home: string): void {
    const anvil = join(home, '.anvil')
    mkdirSync(anvil, { recursive: true })
    writeFileSync(join(anvil, 'models.json'), '{"v":1}')
    mkdirSync(join(anvil, 'cache'), { recursive: true })
    writeFileSync(join(anvil, 'cache', 'large.bin'), 'XXXXXX')
  }

  it('runUninstall with archive=true creates a tarball before removal (project scope)', async () => {
    seedAnvilHome(tmp)
    // Project scope writes to <cwd>/.anvil-backups via opts.home, but the
    // helper places backups under home; we set home=tmp for isolation.
    const summary = await runUninstall({
      scope: 'project',
      cwd: tmp,
      home: tmp,
      archive: true,
    })
    expect(summary.archivePath).toBeDefined()
    expect(summary.archivePath?.startsWith(join(tmp, '.anvil-backups'))).toBe(
      true,
    )
    expect(existsSync(summary.archivePath as string)).toBe(true)
    // .anvil should be gone after run
    expect(existsSync(join(tmp, '.anvil'))).toBe(false)
  })

  it('CLI --archive --dry-run prints would-be archive path without writing', () => {
    seedAnvilHome(tmp)
    if (!existsSync(ANVIL_BIN)) return // skip if not built
    const result = spawnSync(
      'node',
      [
        ANVIL_BIN,
        'uninstall',
        '--scope',
        'global',
        '--archive',
        '--dry-run',
        '--yes',
      ],
      {
        env: { ...process.env, HOME: tmp },
        encoding: 'utf-8',
      },
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/archive:\s+.*\.tgz/)
    // Dry run must not have created the backup dir
    expect(existsSync(join(tmp, '.anvil-backups'))).toBe(false)
    // .anvil/ must still exist
    expect(existsSync(join(tmp, '.anvil'))).toBe(true)
  })

  it('CLI --archive --yes --scope global writes a tarball and removes ~/.anvil', () => {
    seedAnvilHome(tmp)
    if (!existsSync(ANVIL_BIN)) return
    const result = spawnSync(
      'node',
      [ANVIL_BIN, 'uninstall', '--scope', 'global', '--archive', '--yes'],
      {
        env: { ...process.env, HOME: tmp },
        encoding: 'utf-8',
      },
    )
    expect(result.status).toBe(0)
    const backups = readdirSync(join(tmp, '.anvil-backups')).filter((f) =>
      f.endsWith('.tgz'),
    )
    expect(backups.length).toBe(1)
    expect(existsSync(join(tmp, '.anvil'))).toBe(false)
  })
})

describe('runUninstall + statusline unmerge', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('uninstall-sl')
  })

  it('removes anvil-written statusLine block from project settings.json', async () => {
    const claudeDir = join(tmp, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const settingsPath = join(claudeDir, 'settings.json')
    writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: {
          type: 'command',
          command: '/x/.anvil/bin/anvil.cjs statusline',
          padding: 0,
          refreshInterval: 5,
        },
        otherKey: 'preserved',
      }),
    )

    const summary = await runUninstall({ scope: 'project', cwd: tmp })
    expect(
      summary.removed.some((r) => r.includes('removed statusLine (anvil)')),
    ).toBe(true)
    // settings.json itself was removed because .claude/* directories get rm'd —
    // wait no, settings.json is NOT in the rm list, only specific subdirs.
    // Verify it still exists with statusLine gone.
    expect(existsSync(settingsPath)).toBe(true)
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    expect(after.statusLine).toBeUndefined()
    expect(after.otherKey).toBe('preserved')
  })
})
