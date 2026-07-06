import { existsSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { writeAtomic, writeManyAtomic } from '../../../src/installer/atomic.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('atomic')
})

afterAll(() => {
  rmSync(tmp, { recursive: true })
})

describe('writeAtomic', () => {
  it('creates a file with the given content', async () => {
    const path = join(tmp, 'test.txt')
    await writeAtomic(path, 'hello world')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf-8')).toBe('hello world')
  })

  it('creates parent directories as needed', async () => {
    const path = join(tmp, 'deep', 'nested', 'dir', 'file.txt')
    await writeAtomic(path, 'nested content')
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, 'utf-8')).toBe('nested content')
  })

  it('overwrites existing file', async () => {
    const path = join(tmp, 'overwrite.txt')
    await writeAtomic(path, 'first')
    await writeAtomic(path, 'second')
    expect(readFileSync(path, 'utf-8')).toBe('second')
  })

  it('writes Buffer content', async () => {
    const path = join(tmp, 'buffer.bin')
    const buf = Buffer.from([0x01, 0x02, 0x03])
    await writeAtomic(path, buf)
    const read = readFileSync(path)
    expect(read.equals(buf)).toBe(true)
  })

  it('sets executable flag when requested', async () => {
    const path = join(tmp, 'script.sh')
    await writeAtomic(path, '#!/bin/sh\necho hi', { executable: true })
    const mode = statSync(path).mode
    // Check owner execute bit (0o100)
    expect(mode & 0o100).toBe(0o100)
  })

  it('does not leave .tmp file behind after success', async () => {
    const path = join(tmp, 'no-tmp.txt')
    await writeAtomic(path, 'clean')
    const files = require('node:fs').readdirSync(tmp)
    const tmpFiles = files.filter((f: string) => f.includes('.tmp.'))
    expect(tmpFiles).toHaveLength(0)
  })
})

describe('writeManyAtomic', () => {
  it('writes multiple files to root', async () => {
    const root = join(tmp, 'many')
    const files = [
      { relativePath: 'a.txt', content: 'aaa' },
      { relativePath: 'sub/b.txt', content: 'bbb' },
    ]
    const written = await writeManyAtomic(root, files)
    expect(written).toHaveLength(2)
    expect(existsSync(join(root, 'a.txt'))).toBe(true)
    expect(existsSync(join(root, 'sub', 'b.txt'))).toBe(true)
    expect(readFileSync(join(root, 'a.txt'), 'utf-8')).toBe('aaa')
  })

  it('returns absolute paths of written files', async () => {
    const root = join(tmp, 'many2')
    const files = [{ relativePath: 'x.json', content: '{}' }]
    const written = await writeManyAtomic(root, files)
    expect(written[0]).toBe(join(root, 'x.json'))
  })

  it('handles empty files array', async () => {
    const root = join(tmp, 'empty-many')
    const written = await writeManyAtomic(root, [])
    expect(written).toHaveLength(0)
  })
})
