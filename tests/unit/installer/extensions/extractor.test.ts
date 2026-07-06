/**
 * ANV-0027 — Path-traversal-safe extractor tests.
 *
 * Fixture archives are generated programmatically at test setup (tar via
 * `tar` shell command, zip via python3's stdlib `zipfile`). Both are
 * present in CI and on Anvil's supported dev platforms.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { safeExtract } from '../../../../src/installer/extensions/index.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

function makeBenignTarGz(stageDir: string, archivePath: string): void {
  mkdirSync(join(stageDir, 'sub'), { recursive: true })
  writeFileSync(join(stageDir, 'README.md'), '# hello\n')
  writeFileSync(join(stageDir, 'sub', 'nested.txt'), 'nested content\n')
  const r = spawnSync(
    'tar',
    ['-czf', archivePath, '-C', stageDir, 'README.md', 'sub'],
    { stdio: 'pipe' },
  )
  if (r.status !== 0) {
    throw new Error(`tar failed: ${r.stderr?.toString()}`)
  }
}

function makeTraversalTarGz(stageDir: string, archivePath: string): void {
  // GNU tar refuses to write `..` paths from a regular tree, so we use
  // `--transform` to rename the entry to `../escape.txt` inside the tar.
  writeFileSync(join(stageDir, 'evil.txt'), 'evil content\n')
  const r = spawnSync(
    'tar',
    [
      '-czf',
      archivePath,
      '-C',
      stageDir,
      '--transform',
      's,evil.txt,../escape.txt,',
      'evil.txt',
    ],
    { stdio: 'pipe' },
  )
  if (r.status !== 0) {
    throw new Error(`tar (transform) failed: ${r.stderr?.toString()}`)
  }
}

function makeSymlinkTarGz(stageDir: string, archivePath: string): void {
  const linkPath = join(stageDir, 'badlink')
  spawnSync('ln', ['-s', '/etc/passwd', linkPath])
  const r = spawnSync('tar', ['-czf', archivePath, '-C', stageDir, 'badlink'], {
    stdio: 'pipe',
  })
  if (r.status !== 0) {
    throw new Error(`tar (symlink) failed: ${r.stderr?.toString()}`)
  }
}

function makeBenignZip(stageDir: string, archivePath: string): void {
  mkdirSync(join(stageDir, 'pkg'), { recursive: true })
  writeFileSync(join(stageDir, 'pkg', 'a.txt'), 'A\n')
  writeFileSync(join(stageDir, 'pkg', 'b.txt'), 'B\n')
  const py = `
import os, zipfile
with zipfile.ZipFile(${JSON.stringify(archivePath)}, 'w') as z:
    for root, _dirs, files in os.walk(${JSON.stringify(stageDir)}):
        for f in files:
            full = os.path.join(root, f)
            arc = os.path.relpath(full, ${JSON.stringify(stageDir)})
            z.write(full, arc)
`
  const r = spawnSync('python3', ['-c', py], { stdio: 'pipe' })
  if (r.status !== 0) {
    throw new Error(`python3 zipfile failed: ${r.stderr?.toString()}`)
  }
}

function makeTraversalZip(archivePath: string): void {
  const py = `
import zipfile
with zipfile.ZipFile(${JSON.stringify(archivePath)}, 'w') as z:
    z.writestr('../escape.txt', 'evil')
`
  const r = spawnSync('python3', ['-c', py], { stdio: 'pipe' })
  if (r.status !== 0) {
    throw new Error(`python3 traversal-zip failed: ${r.stderr?.toString()}`)
  }
}

function makeSymlinkZip(archivePath: string): void {
  // Mark the entry's unix mode as a symlink so unzip reports type=`l`.
  const py = `
import zipfile, stat
zi = zipfile.ZipInfo('etclink')
zi.create_system = 3
zi.external_attr = (stat.S_IFLNK | 0o777) << 16
with zipfile.ZipFile(${JSON.stringify(archivePath)}, 'w') as z:
    z.writestr(zi, '/etc')
`
  const r = spawnSync('python3', ['-c', py], { stdio: 'pipe' })
  if (r.status !== 0) {
    throw new Error(`python3 symlink-zip failed: ${r.stderr?.toString()}`)
  }
}

describe('safeExtract', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('extensions-extractor')
  })

  it('extracts a benign tar.gz to the target dir', async () => {
    const stage = join(tmp, 'stage')
    mkdirSync(stage)
    const archive = join(tmp, 'good.tar.gz')
    makeBenignTarGz(stage, archive)
    const target = join(tmp, 'out')

    const r = await safeExtract(archive, target)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.files.length).toBeGreaterThanOrEqual(2)
      expect(readFileSync(join(target, 'README.md'), 'utf8')).toBe('# hello\n')
      expect(readFileSync(join(target, 'sub', 'nested.txt'), 'utf8')).toBe(
        'nested content\n',
      )
    }
  })

  it('extracts a benign zip to the target dir', async () => {
    const stage = join(tmp, 'stage')
    mkdirSync(stage)
    const archive = join(tmp, 'good.zip')
    makeBenignZip(stage, archive)
    const target = join(tmp, 'outz')

    const r = await safeExtract(archive, target)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.files.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('rejects a tar with a ../escape entry', async () => {
    const stage = join(tmp, 'stage-evil')
    mkdirSync(stage)
    const archive = join(tmp, 'evil.tar.gz')
    makeTraversalTarGz(stage, archive)
    const target = join(tmp, 'targ')

    const r = await safeExtract(archive, target)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('PATH_TRAVERSAL')
    }
  })

  it('rejects a zip with a ../escape entry', async () => {
    const archive = join(tmp, 'evil.zip')
    makeTraversalZip(archive)
    const target = join(tmp, 'targz')
    const r = await safeExtract(archive, target)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('PATH_TRAVERSAL')
    }
  })

  it('rejects a tar containing a symlink entry', async () => {
    const stage = join(tmp, 'stage-sym')
    mkdirSync(stage)
    const archive = join(tmp, 'sym.tar.gz')
    makeSymlinkTarGz(stage, archive)
    const target = join(tmp, 'symout')

    const r = await safeExtract(archive, target)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('SYMLINK_REJECTED')
    }
  })

  it('rejects a zip containing a symlink entry', async () => {
    const archive = join(tmp, 'sym.zip')
    makeSymlinkZip(archive)
    const target = join(tmp, 'symzipout')
    const r = await safeExtract(archive, target)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('SYMLINK_REJECTED')
    }
  })

  it('refuses an archive that does not exist', async () => {
    const r = await safeExtract(join(tmp, 'missing.tar.gz'), join(tmp, 'out'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('ARCHIVE_NOT_FOUND')
  })

  it('refuses an unsupported archive format', async () => {
    const archive = join(tmp, 'mystery.rar')
    writeFileSync(archive, 'not really a rar')
    const r = await safeExtract(archive, join(tmp, 'out'))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('UNSUPPORTED_ARCHIVE')
  })
})
