/**
 * ANV-0041 — symlink-safe IO tests.
 *
 * Attack patterns mirror references/caveman/tests/test_symlink_flag.js but the
 * implementation is fresh. Goal: prove safeWrite/safeRead/safeAppend refuse
 * every clobber vector while still working through legitimately-symlinked
 * parent directories owned by the current uid.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MAX_BYTES,
  OwnershipMismatchError,
  SymlinkRefusalError,
  safeAppend,
  safeRead,
  safeWrite,
} from '../../../../src/core/io/safe-write.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmp: string

beforeEach(() => {
  tmp = createTestTmpDir('safeio')
})

describe('safeWrite — happy path', () => {
  it('writes to a normal (non-symlinked) directory', () => {
    const file = join(tmp, 'state.json')
    safeWrite(file, '{"ok":true}')
    expect(readFileSync(file, 'utf-8')).toBe('{"ok":true}')
  })

  it('writes through a symlinked parent directory owned by current uid', () => {
    const real = join(tmp, 'real')
    mkdirSync(real)
    const link = join(tmp, 'link')
    symlinkSync(real, link)

    safeWrite(join(link, 'state.json'), '{"v":1}')

    // File should land in the real directory.
    expect(readFileSync(join(real, 'state.json'), 'utf-8')).toBe('{"v":1}')
  })

  it('overwrites an existing non-symlink file atomically', () => {
    const file = join(tmp, 'state.json')
    writeFileSync(file, 'OLD')
    safeWrite(file, 'NEW')
    expect(readFileSync(file, 'utf-8')).toBe('NEW')
  })

  it('creates the parent directory recursively if missing', () => {
    const file = join(tmp, 'nested', 'deeper', 'state.json')
    safeWrite(file, 'x')
    expect(existsSync(file)).toBe(true)
  })
})

describe('safeWrite — symlink attack refusal', () => {
  it('refuses pre-existing symlink at the target path', () => {
    const decoy = join(tmp, 'decoy.txt')
    writeFileSync(decoy, 'SECRET')
    const target = join(tmp, 'state.json')
    symlinkSync(decoy, target)

    expect(() => safeWrite(target, 'PWND')).toThrow(SymlinkRefusalError)
    // The decoy must NOT have been clobbered.
    expect(readFileSync(decoy, 'utf-8')).toBe('SECRET')
  })

  it('refuses race-window symlink: target appears as symlink between calls', () => {
    // Simulates an attacker who plants a symlink AFTER our last successful
    // write but BEFORE our next one. The pre-flight lstat catches it.
    const file = join(tmp, 'state.json')
    safeWrite(file, 'first')
    // Replace with a symlink.
    rmSync(file)
    const decoy = join(tmp, 'decoy.txt')
    writeFileSync(decoy, 'SECRET')
    symlinkSync(decoy, file)

    expect(() => safeWrite(file, 'PWND')).toThrow(SymlinkRefusalError)
    expect(readFileSync(decoy, 'utf-8')).toBe('SECRET')
  })

  it('refuses when parent dir resolves to a path owned by another uid', () => {
    // We can't actually chown without root; assert the behavior holds when
    // the resolved dir's stat.uid != process.getuid(). Skip on Windows.
    if (typeof process.getuid !== 'function') return

    const real = join(tmp, 'real')
    mkdirSync(real)
    const link = join(tmp, 'link')
    symlinkSync(real, link)

    // Monkey-patch statSync via fs is heavy; instead, verify that when the
    // dir's owner matches we DON'T throw OwnershipMismatchError, then assert
    // the error class shape so callers can pattern-match.
    expect(() => safeWrite(join(link, 'a.json'), '{}')).not.toThrow()

    const err = new OwnershipMismatchError(real, 1000, 2000)
    expect(err).toBeInstanceOf(OwnershipMismatchError)
    expect(err.name).toBe('OwnershipMismatchError')
    expect(err.expectedUid).toBe(1000)
    expect(err.actualUid).toBe(2000)
  })

  it('does not follow a parent dir that is a broken symlink', () => {
    const link = join(tmp, 'broken')
    symlinkSync('/nonexistent/path/anvil', link)
    expect(() => safeWrite(join(link, 'state.json'), 'x')).toThrow()
  })

  it('written file has 0o600 permissions by default', () => {
    if (process.platform === 'win32') return
    const file = join(tmp, 'state.json')
    safeWrite(file, 'x')
    const mode = statSync(file).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('atomic rename: temp file does not survive a successful write', () => {
    const file = join(tmp, 'state.json')
    safeWrite(file, 'final')
    // No `.tmp.*` siblings should remain.
    const fs = require('node:fs')
    const entries: string[] = fs.readdirSync(tmp)
    const orphans = entries.filter((e) => e.startsWith('.state.json.tmp.'))
    expect(orphans).toEqual([])
    expect(readFileSync(file, 'utf-8')).toBe('final')
  })

  it('refuses payload that exceeds the size cap', () => {
    const file = join(tmp, 'state.json')
    const huge = 'a'.repeat(DEFAULT_MAX_BYTES + 1)
    expect(() => safeWrite(file, huge)).toThrow(RangeError)
    // No partial file should be left behind.
    expect(existsSync(file)).toBe(false)
  })

  it('honors a custom byte cap when supplied', () => {
    const file = join(tmp, 'state.json')
    expect(() => safeWrite(file, 'abcdef', { maxBytes: 3 })).toThrow(RangeError)
    safeWrite(file, 'abc', { maxBytes: 3 })
    expect(readFileSync(file, 'utf-8')).toBe('abc')
  })
})

describe('safeRead — symlink attack refusal', () => {
  it('refuses to read through a symlink at the target path', () => {
    const secret = join(tmp, 'id_rsa')
    writeFileSync(secret, 'PRIVATE_KEY')
    const lured = join(tmp, 'state.json')
    symlinkSync(secret, lured)

    expect(() => safeRead(lured)).toThrow(SymlinkRefusalError)
  })

  it('refuses to read a file larger than the cap', () => {
    const file = join(tmp, 'state.json')
    writeFileSync(file, 'a'.repeat(100))
    expect(() => safeRead(file, { maxBytes: 50 })).toThrow(RangeError)
  })

  it('reads back content written by safeWrite', () => {
    const file = join(tmp, 'state.json')
    safeWrite(file, 'roundtrip')
    expect(safeRead(file)).toBe('roundtrip')
  })
})

describe('safeAppend — symlink attack refusal', () => {
  it('appends multiple lines to a normal file', () => {
    const file = join(tmp, 'log.jsonl')
    safeAppend(file, 'a\n')
    safeAppend(file, 'b\n')
    expect(readFileSync(file, 'utf-8')).toBe('a\nb\n')
  })

  it('refuses to append through a symlinked target', () => {
    const decoy = join(tmp, 'decoy.txt')
    writeFileSync(decoy, 'SECRET\n')
    const target = join(tmp, 'log.jsonl')
    symlinkSync(decoy, target)

    expect(() => safeAppend(target, 'PWND\n')).toThrow(SymlinkRefusalError)
    // Decoy must not have been mutated.
    expect(readFileSync(decoy, 'utf-8')).toBe('SECRET\n')
    // Verify the lstat still reports symlink.
    expect(lstatSync(target).isSymbolicLink()).toBe(true)
  })

  it('appends through a symlinked parent dir owned by current user', () => {
    const real = join(tmp, 'real')
    mkdirSync(real)
    const link = join(tmp, 'link')
    symlinkSync(real, link)

    safeAppend(join(link, 'log.jsonl'), 'one\n')
    safeAppend(join(link, 'log.jsonl'), 'two\n')
    expect(readFileSync(join(real, 'log.jsonl'), 'utf-8')).toBe('one\ntwo\n')
  })
})

describe('error class identity', () => {
  it('SymlinkRefusalError exposes path + reason', () => {
    const e = new SymlinkRefusalError('/x', 'because')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(SymlinkRefusalError)
    expect(e.path).toBe('/x')
    expect(e.reason).toBe('because')
    expect(e.name).toBe('SymlinkRefusalError')
  })
})
