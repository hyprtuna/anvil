import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:fs/promises before importing the module under test.
vi.mock('node:fs/promises')

import * as fsp from 'node:fs/promises'
// Import after mock is registered.
import { writeManyAtomic } from '../../../src/installer/atomic.js'

const ROOT = '/fake/root'

function makeFile(name: string) {
  return { relativePath: name, content: `content-${name}` }
}

function buildFixture() {
  return [
    makeFile('file0.txt'),
    makeFile('file1.txt'),
    makeFile('file2.txt'),
    makeFile('file3.txt'),
    makeFile('file4.txt'),
  ]
}

describe('writeManyAtomic — mid-batch failure rollback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    // Default: mkdir always succeeds.
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined)
    // Default: rename always succeeds (completes the writeAtomic "commit" step).
    vi.mocked(fsp.rename).mockResolvedValue(undefined)
    // Default: unlink always succeeds.
    vi.mocked(fsp.unlink).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('rejects with the original error when the 3rd write throws', async () => {
    const writeError = new Error('ENOSPC: no space left on device')
    let writeCallCount = 0

    vi.mocked(fsp.writeFile).mockImplementation(async () => {
      writeCallCount++
      // The 3rd writeFile call corresponds to file index 2 (the 3rd file).
      if (writeCallCount === 3) {
        throw writeError
      }
    })

    const files = buildFixture()
    await expect(writeManyAtomic(ROOT, files)).rejects.toThrow(writeError)
  })

  it('unlinks files 0 and 1 after the 3rd write throws', async () => {
    const writeError = new Error('ENOSPC: no space left on device')
    let writeCallCount = 0

    vi.mocked(fsp.writeFile).mockImplementation(async () => {
      writeCallCount++
      if (writeCallCount === 3) throw writeError
    })

    const files = buildFixture()
    await expect(writeManyAtomic(ROOT, files)).rejects.toThrow()

    // writeManyAtomic tracks paths via join(root, relativePath).
    // writeAtomic pushes the path to `written` only AFTER rename() succeeds —
    // i.e., only files 0 and 1 were fully written before the 3rd threw.
    const unlinkedPaths = vi
      .mocked(fsp.unlink)
      .mock.calls.map((c) => c[0] as string)

    expect(unlinkedPaths).toContain(join(ROOT, 'file0.txt'))
    expect(unlinkedPaths).toContain(join(ROOT, 'file1.txt'))
    expect(unlinkedPaths).toHaveLength(2)
  })

  it('never writes files 3 and 4 when the 3rd write throws', async () => {
    const writeError = new Error('ENOSPC: no space left on device')
    let writeCallCount = 0

    vi.mocked(fsp.writeFile).mockImplementation(async () => {
      writeCallCount++
      if (writeCallCount === 3) throw writeError
    })

    const files = buildFixture()
    await expect(writeManyAtomic(ROOT, files)).rejects.toThrow()

    // writeFile is called at most 3 times (file0, file1, file2-throws).
    expect(vi.mocked(fsp.writeFile).mock.calls).toHaveLength(3)
  })

  it('calls onRollback once with [path0, path1] in correct order', async () => {
    const writeError = new Error('ENOSPC: no space left on device')
    let writeCallCount = 0

    vi.mocked(fsp.writeFile).mockImplementation(async () => {
      writeCallCount++
      if (writeCallCount === 3) throw writeError
    })

    const onRollback = vi.fn()
    const files = buildFixture()
    await expect(writeManyAtomic(ROOT, files, { onRollback })).rejects.toThrow()

    expect(onRollback).toHaveBeenCalledOnce()
    const [rolledBackPaths] = onRollback.mock.calls[0] as [string[]]
    expect(rolledBackPaths).toEqual([
      join(ROOT, 'file0.txt'),
      join(ROOT, 'file1.txt'),
    ])
  })
})

describe('writeManyAtomic — unlink-itself-throws during rollback', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(fsp.mkdir).mockResolvedValue(undefined)
    vi.mocked(fsp.rename).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('propagates the original write error even when unlink throws', async () => {
    const writeError = new Error('ENOSPC: no space left on device')
    const unlinkError = new Error('EACCES: permission denied')
    let writeCallCount = 0

    vi.mocked(fsp.writeFile).mockImplementation(async () => {
      writeCallCount++
      if (writeCallCount === 3) throw writeError
    })

    // unlink always throws (e.g. permissions problem during rollback).
    vi.mocked(fsp.unlink).mockRejectedValue(unlinkError)

    const files = buildFixture()

    // The original write error must surface — not the unlink error.
    // writeManyAtomic swallows unlink failures via .catch(() => {}).
    const rejection = await writeManyAtomic(ROOT, files).catch(
      (e: unknown) => e,
    )
    expect(rejection).toBe(writeError)
    expect(rejection).not.toBe(unlinkError)
  })
})
