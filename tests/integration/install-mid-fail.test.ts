import { existsSync, rmSync } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the atomic module — preserve writeAtomic so we can call it directly,
// and allow spying on writeManyAtomic.
vi.mock('../../src/installer/atomic.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/installer/atomic.js')>()
  return { ...original }
})

import * as atomicMod from '../../src/installer/atomic.js'
import { runInstaller } from '../../src/installer/install.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const tmps: string[] = []

function makeTmp(): string {
  const t = createTestTmpDir('midfail')
  tmps.push(t)
  return t
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const t of tmps.splice(0)) {
    rmSync(t, { recursive: true, force: true })
  }
})

// Build a mock that:
//   - Lets adapter call #1 succeed (passes through to the real writeAtomic).
//   - On adapter call #2, fails on the 3rd file write, rolls back the 2 written
//     files, and re-throws — exactly mirroring what writeManyAtomic does internally.
function mockSecondAdapterFails(adapterAWrittenOut: string[] = []): () => void {
  let adapterCallCount = 0

  const spy = vi
    .spyOn(atomicMod, 'writeManyAtomic')
    .mockImplementation(async (root, files, opts) => {
      adapterCallCount++

      if (adapterCallCount === 1) {
        // Adapter A: write all files normally.
        const written: string[] = []
        for (const f of files) {
          const path = join(root, f.relativePath)
          await atomicMod.writeAtomic(path, f.content, {
            executable: f.executable,
          })
          written.push(path)
          adapterAWrittenOut.push(path)
        }
        return written
      }

      // Adapter B: fail on the 3rd file, roll back the first 2.
      const written: string[] = []
      let fileIdx = 0
      try {
        for (const f of files) {
          if (fileIdx === 2) {
            throw new Error(
              'ENOSPC: simulated mid-write failure (file index 2)',
            )
          }
          const path = join(root, f.relativePath)
          await atomicMod.writeAtomic(path, f.content, {
            executable: f.executable,
          })
          written.push(path)
          fileIdx++
        }
        return written
      } catch (err) {
        for (const p of written) await unlink(p).catch(() => {})
        opts?.onRollback?.(written)
        throw err
      }
    })

  return () => spy.mockRestore()
}

describe('runInstaller — mid-second-adapter failure', () => {
  it('rejects with a wrapped error matching /install failed mid-write; \\d+ file/', async () => {
    const tmp = makeTmp()
    const restore = mockSecondAdapterFails()

    try {
      await expect(
        runInstaller({
          target: 'both',
          scope: 'project',
          preset: 'balanced',
          cwd: tmp,
          home: tmp,
        }),
      ).rejects.toMatchObject({
        message: expect.stringMatching(/install failed mid-write; \d+ file/),
      })
    } finally {
      restore()
    }
  })

  it("err.rolledBack lists the failing adapter's partial writes", async () => {
    const tmp = makeTmp()
    const restore = mockSecondAdapterFails()

    let caught: (Error & { rolledBack?: string[] }) | null = null
    try {
      await runInstaller({
        target: 'both',
        scope: 'project',
        preset: 'balanced',
        cwd: tmp,
        home: tmp,
      })
    } catch (e) {
      caught = e as Error & { rolledBack?: string[] }
    } finally {
      restore()
    }

    expect(caught).not.toBeNull()
    expect(caught?.rolledBack).toBeDefined()
    // Adapter B wrote 2 files before the 3rd throw; those 2 are the rolledBack set.
    expect(caught?.rolledBack).toHaveLength(2)
  })

  it('re-running cleanly (without the mock) succeeds — idempotent', async () => {
    // No mock active — straight real install; must succeed.
    const tmp = makeTmp()

    const result = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
      home: tmp,
    })

    expect(result.dryRun).toBe(false)
    expect(result.filesWritten.length).toBeGreaterThan(0)

    // Running again on the same directory must also succeed (idempotent).
    const result2 = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
      home: tmp,
    })
    expect(result2.filesWritten.length).toBeGreaterThan(0)
  })

  it('adapter A files survive when adapter B fails mid-write', async () => {
    // Documents the CURRENT (unfixed) behavior: when adapter B fails, adapter A's
    // already-written files remain on disk. install.ts only collects rolledBack
    // from the FAILING adapter's onRollback callback; adapter A's files are never
    // passed to any rollback handler, so they persist after the wrapped error fires.
    //
    // TODO: cross-adapter rollback gap — see backlog#install-cross-adapter-rollback

    const tmp = makeTmp()
    const adapterAWritten: string[] = []
    const restore = mockSecondAdapterFails(adapterAWritten)

    try {
      await runInstaller({
        target: 'both',
        scope: 'project',
        preset: 'balanced',
        cwd: tmp,
        home: tmp,
      })
    } catch {
      // expected to throw
    } finally {
      restore()
    }

    // Adapter A wrote files and they should still exist on disk — this is the gap.
    // When the cross-adapter rollback fix lands (backlog#install-cross-adapter-rollback),
    // these files should no longer exist after a failed install, and this assertion
    // will need to be inverted.
    expect(adapterAWritten.length).toBeGreaterThan(0)
    for (const p of adapterAWritten) {
      // TODO: cross-adapter rollback gap — see backlog#install-cross-adapter-rollback
      expect(existsSync(p)).toBe(true)
    }
  })
})
