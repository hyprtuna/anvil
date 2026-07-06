import {
  existsSync,
  mkdirSync,
  readdirSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ARCHIVE_RETENTION,
  archiveAnvilHome,
} from '../../../src/installer/archive-anvil-home.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('archiveAnvilHome', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('archive')
  })

  function makeAnvilHome(): string {
    const home = join(tmp, '.anvil')
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'models.json'), '{"x":1}')
    mkdirSync(join(home, 'cache'), { recursive: true })
    writeFileSync(join(home, 'cache', 'big-file'), 'BIGDATA')
    return home
  }

  it('dryRun reports archive path without writing', async () => {
    const anvilHome = makeAnvilHome()
    const backupsDir = join(tmp, '.anvil-backups')
    const result = await archiveAnvilHome({
      anvilHome,
      backupsDir,
      dryRun: true,
    })
    expect(result.created).toBe(false)
    expect(result.archivePath).toMatch(/\.tgz$/)
    expect(existsSync(backupsDir)).toBe(false)
  })

  it('creates a tarball excluding cache/', async () => {
    const anvilHome = makeAnvilHome()
    const backupsDir = join(tmp, '.anvil-backups')
    const result = await archiveAnvilHome({
      anvilHome,
      backupsDir,
      dryRun: false,
    })
    expect(result.created).toBe(true)
    expect(existsSync(result.archivePath)).toBe(true)
    expect(result.archivePath.startsWith(backupsDir)).toBe(true)

    // Inspect tarball contents — cache/ should NOT be present.
    const { spawnSync } = await import('node:child_process')
    const list = spawnSync('tar', ['tzf', result.archivePath], {
      encoding: 'utf-8',
    })
    expect(list.status).toBe(0)
    const entries = list.stdout.split('\n').filter(Boolean)
    expect(entries.some((e) => e.includes('models.json'))).toBe(true)
    expect(entries.some((e) => e.includes('cache/big-file'))).toBe(false)
  })

  it('returns no-op when anvilHome is absent', async () => {
    const backupsDir = join(tmp, '.anvil-backups')
    const result = await archiveAnvilHome({
      anvilHome: join(tmp, 'missing-anvil'),
      backupsDir,
      dryRun: false,
    })
    expect(result.created).toBe(false)
    expect(result.pruned).toEqual([])
  })

  it(`prunes archives beyond retention (${ARCHIVE_RETENTION})`, async () => {
    const anvilHome = makeAnvilHome()
    const backupsDir = join(tmp, '.anvil-backups')
    mkdirSync(backupsDir, { recursive: true })

    // Pre-seed 6 old archives with strictly increasing mtimes so the new
    // one we create will be the freshest.
    const baseTime = Date.now() / 1000 - 10000
    const seeded: string[] = []
    for (let i = 0; i < 6; i++) {
      const p = join(backupsDir, `seed-${i}.tgz`)
      writeFileSync(p, 'fake')
      const t = baseTime + i
      utimesSync(p, t, t)
      seeded.push(p)
    }

    const result = await archiveAnvilHome({
      anvilHome,
      backupsDir,
      dryRun: false,
    })
    expect(result.created).toBe(true)
    // After: 7 candidates, retain 5, prune 2 oldest seeds.
    const remaining = readdirSync(backupsDir).filter((f) => f.endsWith('.tgz'))
    expect(remaining).toHaveLength(ARCHIVE_RETENTION)
    expect(result.pruned.length).toBe(2)
    // The two pruned should be the oldest seeded files.
    expect(result.pruned).toContain(seeded[0])
    expect(result.pruned).toContain(seeded[1])
  })
})
