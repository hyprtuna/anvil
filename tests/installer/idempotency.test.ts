import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runInstaller } from '../../src/installer/install.js'
import type { InstallOptions } from '../../src/installer/install.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function makeTmp(): string {
  const tmp = createTestTmpDir('idempotency')
  return tmp
}

interface FileSnapshot {
  path: string
  content: string
  executable: boolean
}

function snapshot(root: string): FileSnapshot[] {
  const out: FileSnapshot[] = []
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.isFile()) {
        const st = statSync(full)
        out.push({
          path: relative(root, full),
          content: readFileSync(full, 'utf-8'),
          executable: (st.mode & 0o111) !== 0,
        })
      }
    }
  }
  walk(root)
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

async function runOnce(opts: InstallOptions) {
  return runInstaller(opts)
}

describe('installer idempotency', () => {
  it('produces byte-identical output when run twice with the same inputs', async () => {
    const tmp = makeTmp()
    const opts: InstallOptions = {
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    }

    await runOnce(opts)
    const first = snapshot(tmp)

    await runOnce(opts)
    const second = snapshot(tmp)

    expect(second.map((f) => f.path)).toEqual(first.map((f) => f.path))
    for (let i = 0; i < first.length; i++) {
      expect(second[i].path).toBe(first[i].path)
      expect(second[i].content, `content drift in ${first[i].path}`).toBe(
        first[i].content,
      )
      expect(second[i].executable, `exec-bit drift in ${first[i].path}`).toBe(
        first[i].executable,
      )
    }
  })

  it('produces byte-identical output for the "both" target across two runs', async () => {
    const tmp = makeTmp()
    const opts: InstallOptions = {
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    }

    await runOnce(opts)
    const first = snapshot(tmp)

    await runOnce(opts)
    const second = snapshot(tmp)

    expect(second).toEqual(first)
  })
})
