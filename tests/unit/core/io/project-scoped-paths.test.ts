/**
 * Tests for project-scoped sidecar path helpers (ANV-NNNN).
 *
 * Verifies:
 *  1. projectsRoot() returns ~/.anvil/projects and honors ANVIL_HOME.
 *  2. projectDir() returns a path under projectsRoot().
 *  3. getProjectScopedPath() returns <projectDir>/<name>.json.
 *  4. ensureProjectDir() creates the directory and returns it.
 *  5. Migration: legacy-only → moved.
 *  6. Migration: both-exist → both kept, no clobber.
 *  7. Migration: neither → no-op.
 *  8. ANVIL_HOME env override respected.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ensureProjectDir,
  getProjectScopedPath,
  projectDir,
  projectsRoot,
} from '../../../../src/core/io/project-scoped-paths.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(prefix: string): string {
  const dir = join(
    homedir(),
    'tmp',
    `test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
}

// ─── Test state ───────────────────────────────────────────────────────────────

let fakeAnvilHome: string
let tmpCwd: string
let origAnvilHome: string | undefined

beforeEach(() => {
  fakeAnvilHome = makeTmpDir('anvil-home')
  tmpCwd = makeTmpDir('cwd')
  origAnvilHome = process.env.ANVIL_HOME
  process.env.ANVIL_HOME = fakeAnvilHome
})

afterEach(() => {
  if (origAnvilHome !== undefined) {
    process.env.ANVIL_HOME = origAnvilHome
  } else {
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
  }
  try {
    rmSync(fakeAnvilHome, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  try {
    rmSync(tmpCwd, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

// ─── projectsRoot ─────────────────────────────────────────────────────────────

describe('projectsRoot()', () => {
  it('returns <ANVIL_HOME>/projects when ANVIL_HOME is set', () => {
    const root = projectsRoot()
    expect(root).toBe(join(fakeAnvilHome, 'projects'))
  })

  it('falls back to <HOME>/.anvil/projects when ANVIL_HOME is not set', () => {
    // biome-ignore lint/performance/noDelete: process.env.ANVIL_HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    delete process.env.ANVIL_HOME
    const root = projectsRoot()
    expect(root).toBe(join(process.env.HOME ?? homedir(), '.anvil', 'projects'))
  })
})

// ─── projectDir ───────────────────────────────────────────────────────────────

describe('projectDir()', () => {
  it('returns a path under projectsRoot()', async () => {
    const dir = await projectDir(tmpCwd)
    expect(dir.startsWith(projectsRoot())).toBe(true)
  })

  it('returns a stable path for the same cwd', async () => {
    const a = await projectDir(tmpCwd)
    const b = await projectDir(tmpCwd)
    expect(a).toBe(b)
  })
})

// ─── getProjectScopedPath ─────────────────────────────────────────────────────

describe('getProjectScopedPath()', () => {
  it('returns <projectDir(cwd)>/<name>.json for each canonical name', async () => {
    const names = [
      'active-routing',
      'active-skill',
      'project',
      'registry',
    ] as const
    for (const name of names) {
      const p = await getProjectScopedPath(tmpCwd, name)
      const dir = await projectDir(tmpCwd)
      expect(p).toBe(join(dir, `${name}.json`))
    }
  })
})

// ─── ensureProjectDir ─────────────────────────────────────────────────────────

describe('ensureProjectDir()', () => {
  it('creates the project directory and returns its path', async () => {
    const dir = await ensureProjectDir(tmpCwd)
    expect(existsSync(dir)).toBe(true)
  })

  it('returns the same dir as projectDir()', async () => {
    const dir = await ensureProjectDir(tmpCwd)
    expect(dir).toBe(await projectDir(tmpCwd))
  })
})

// ─── Migration ────────────────────────────────────────────────────────────────

describe('ensureProjectDir() — migration', () => {
  it('moves legacy file to new path when new path does not exist', async () => {
    // Arrange: write to legacy .anvil/ location
    const legacyDir = join(tmpCwd, '.anvil')
    mkdirSync(legacyDir, { recursive: true })
    const legacyPath = join(legacyDir, 'registry.json')
    writeFileSync(legacyPath, '{"skills":["test"],"agents":[]}', 'utf-8')

    expect(existsSync(legacyPath)).toBe(true)

    // Act
    await ensureProjectDir(tmpCwd)

    // Assert: legacy gone, new path present
    const newPath = await getProjectScopedPath(tmpCwd, 'registry')
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(newPath)).toBe(true)
    const content = readFileSync(newPath, 'utf-8')
    expect(content).toContain('test')
  })

  it('does not clobber new path when both exist', async () => {
    // Arrange: write to BOTH paths
    const legacyDir = join(tmpCwd, '.anvil')
    mkdirSync(legacyDir, { recursive: true })
    const legacyPath = join(legacyDir, 'registry.json')
    writeFileSync(legacyPath, '{"skills":["legacy"],"agents":[]}', 'utf-8')

    // Pre-create the new path
    const newDir = await ensureProjectDir(tmpCwd)
    const newPath = join(newDir, 'registry.json')
    writeFileSync(newPath, '{"skills":["new"],"agents":[]}', 'utf-8')
    // Restore legacy file (ensureProjectDir above already ran migration once)
    writeFileSync(
      legacyPath,
      '{"skills":["legacy-restored"],"agents":[]}',
      'utf-8',
    )

    // Act: run again
    await ensureProjectDir(tmpCwd)

    // Assert: new path unchanged (legacy content not clobbered)
    const content = readFileSync(newPath, 'utf-8')
    expect(content).toContain('new')
    // Legacy file still exists (both-exist → leave both)
    expect(existsSync(legacyPath)).toBe(true)
  })

  it('is a no-op when neither legacy nor new path exist', async () => {
    // Should not throw
    const dir = await ensureProjectDir(tmpCwd)
    const newPath = join(dir, 'registry.json')
    expect(existsSync(newPath)).toBe(false)
  })
})

// ─── ANVIL_HOME env override ──────────────────────────────────────────────────

describe('ANVIL_HOME env override', () => {
  it('routes project state under ANVIL_HOME/projects/', async () => {
    const p = await getProjectScopedPath(tmpCwd, 'active-skill')
    expect(p.startsWith(join(fakeAnvilHome, 'projects'))).toBe(true)
  })

  it('changing ANVIL_HOME changes the root', async () => {
    const dir1 = await projectDir(tmpCwd)

    const altHome = makeTmpDir('alt-anvil-home')
    try {
      process.env.ANVIL_HOME = altHome
      const dir2 = await projectDir(tmpCwd)
      expect(dir1).not.toBe(dir2)
      expect(dir2.startsWith(join(altHome, 'projects'))).toBe(true)
    } finally {
      process.env.ANVIL_HOME = fakeAnvilHome
      rmSync(altHome, { recursive: true, force: true })
    }
  })
})
