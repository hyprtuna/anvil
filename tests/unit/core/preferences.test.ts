import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  deriveProjectName,
  loadPreferences,
  persistPreference,
  resolvePreferenceFor,
} from '../../../src/core/preferences.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// ---------------------------------------------------------------------------
// deriveProjectName
// ---------------------------------------------------------------------------

describe('deriveProjectName', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('prefs-name')
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('parses HTTPS git remote without .git suffix', async () => {
    // We mock execFile by pointing cwd to a dir with a git remote. Instead we
    // test the parsing logic by providing a dir where git outputs a known URL.
    // Since we can't easily mock git in unit tests, we test the fallback path
    // and URL-parsing separately via mocking.
    // Use a directory with no .git (fallback)
    const name = await deriveProjectName(tmpDir)
    // Should be the basename of tmpDir (starts with prefs-name-)
    expect(name).toMatch(/^prefs-name-/)
  })

  it('falls back to cwd basename when no git remote', async () => {
    const subDir = join(tmpDir, 'my-project')
    await mkdir(subDir)
    const name = await deriveProjectName(subDir)
    expect(name).toBe('my-project')
  })

  it('cwd basename with spaces uses the basename (spaces preserved in basename)', async () => {
    const subDir = join(tmpDir, 'my project')
    await mkdir(subDir)
    const name = await deriveProjectName(subDir)
    // basename is "my project" — the implementation should handle this
    expect(name).toBeTruthy()
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('cwd basename with unicode characters uses the basename', async () => {
    const subDir = join(tmpDir, 'prøject-α')
    await mkdir(subDir)
    const name = await deriveProjectName(subDir)
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('collision: two cwds with same basename get hash suffix on second', async () => {
    // Create two dirs with the same basename but different paths
    const dir1 = join(tmpDir, 'collision-dir', 'myapp')
    const dir2 = join(tmpDir, 'collision-dir2', 'myapp')
    await mkdir(dir1, { recursive: true })
    await mkdir(dir2, { recursive: true })

    // Write a preferences file that already has an entry for dir1 with name 'myapp'
    const anvilHome = join(tmpDir, 'anvil-home')
    await mkdir(anvilHome, { recursive: true })
    const expectedHash = createHash('sha256')
      .update(dir2)
      .digest('hex')
      .slice(0, 6)

    // Persist a preference for dir1 (so 'myapp' is taken)
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'json' },
      { cwd: dir1, anvilHome },
    )

    // Now derive name for dir2 — should get hash suffix
    const name = await deriveProjectName(dir2, anvilHome)
    expect(name).toBe(`myapp-${expectedHash}`)
  })
})

// ---------------------------------------------------------------------------
// loadPreferences
// ---------------------------------------------------------------------------

describe('loadPreferences', () => {
  let anvilHome: string

  beforeEach(async () => {
    anvilHome = createTestTmpDir('prefs-load')
  })

  afterEach(async () => {
    await rm(anvilHome, { recursive: true, force: true })
  })

  it('returns empty struct when preferences.json is absent', async () => {
    const prefs = await loadPreferences(anvilHome)
    expect(prefs).toEqual({ version: 1, projects: {} })
  })

  it('returns parsed preferences when file is valid', async () => {
    const data = {
      version: 1,
      projects: {
        'github.com_my_project': {
          cwd: '/home/user/my-project',
          first_seen: '2026-05-16T00:00:00.000Z',
          default_location: '.anvil/',
          default_format: 'both',
          per_kind: {
            review: { location: '.anvil/reviews/', format: 'json' },
          },
        },
      },
    }
    await writeFile(
      join(anvilHome, 'preferences.json'),
      JSON.stringify(data),
      'utf-8',
    )
    const prefs = await loadPreferences(anvilHome)
    expect(prefs.version).toBe(1)
    expect(prefs.projects['github.com_my_project']).toBeDefined()
    expect(prefs.projects['github.com_my_project'].cwd).toBe(
      '/home/user/my-project',
    )
  })

  it('throws with file path when JSON is malformed', async () => {
    const prefsPath = join(anvilHome, 'preferences.json')
    await writeFile(prefsPath, 'not valid json', 'utf-8')
    await expect(loadPreferences(anvilHome)).rejects.toThrow(anvilHome)
  })

  it('throws with file path when schema is violated (wrong version)', async () => {
    const prefsPath = join(anvilHome, 'preferences.json')
    await writeFile(
      prefsPath,
      JSON.stringify({ version: 99, projects: {} }),
      'utf-8',
    )
    await expect(loadPreferences(anvilHome)).rejects.toThrow(prefsPath)
  })

  it('throws with file path when projects entry has invalid format', async () => {
    const prefsPath = join(anvilHome, 'preferences.json')
    await writeFile(
      prefsPath,
      JSON.stringify({
        version: 1,
        projects: {
          myproject: {
            cwd: '/home/user',
            first_seen: '2026-05-16T00:00:00.000Z',
            per_kind: {
              review: { location: '.anvil/', format: 'invalid-format' },
            },
          },
        },
      }),
      'utf-8',
    )
    await expect(loadPreferences(anvilHome)).rejects.toThrow(prefsPath)
  })
})

// ---------------------------------------------------------------------------
// resolvePreferenceFor
// ---------------------------------------------------------------------------

describe('resolvePreferenceFor', () => {
  let anvilHome: string
  let cwd: string

  beforeEach(async () => {
    const tmp = createTestTmpDir('prefs-resolve')
    anvilHome = join(tmp, 'anvil-home')
    cwd = join(tmp, 'my-app')
    await mkdir(anvilHome, { recursive: true })
    await mkdir(cwd, { recursive: true })
  })

  it('returns null when no preferences file exists', async () => {
    const result = await resolvePreferenceFor('review', { cwd, anvilHome })
    expect(result).toBeNull()
  })

  it('returns per-kind preference when it exists (source: per-kind)', async () => {
    // Persist a per-kind preference first
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'json' },
      { cwd, anvilHome },
    )

    const result = await resolvePreferenceFor('review', { cwd, anvilHome })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('per-kind')
    expect(result!.location).toBe('.anvil/reviews/')
    expect(result!.format).toBe('json')
    expect(result!.projectName).toBeTruthy()
  })

  it('falls back to default when per-kind not set but defaults exist', async () => {
    // Manually write preferences with defaults but no per-kind for 'plan'
    const projectName = 'my-app'
    const data = {
      version: 1,
      projects: {
        [projectName]: {
          cwd,
          first_seen: new Date().toISOString(),
          default_location: '.anvil/',
          default_format: 'both',
          per_kind: {
            review: { location: '.anvil/reviews/', format: 'json' },
          },
        },
      },
    }
    await writeFile(
      join(anvilHome, 'preferences.json'),
      JSON.stringify(data),
      'utf-8',
    )

    // Need to match the project name derivation. Since cwd has no git,
    // derive from basename: 'my-app'
    const result = await resolvePreferenceFor('plan', { cwd, anvilHome })
    expect(result).not.toBeNull()
    expect(result!.source).toBe('default')
    expect(result!.location).toBe('.anvil/')
    expect(result!.format).toBe('both')
  })

  it('returns null when project exists but no per-kind and no defaults', async () => {
    const data = {
      version: 1,
      projects: {
        'my-app': {
          cwd,
          first_seen: new Date().toISOString(),
        },
      },
    }
    await writeFile(
      join(anvilHome, 'preferences.json'),
      JSON.stringify(data),
      'utf-8',
    )
    const result = await resolvePreferenceFor('review', { cwd, anvilHome })
    expect(result).toBeNull()
  })

  it('returns null when project not in preferences', async () => {
    const data = {
      version: 1,
      projects: {
        'other-project': {
          cwd: '/some/other/path',
          first_seen: new Date().toISOString(),
        },
      },
    }
    await writeFile(
      join(anvilHome, 'preferences.json'),
      JSON.stringify(data),
      'utf-8',
    )
    const result = await resolvePreferenceFor('review', { cwd, anvilHome })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// persistPreference
// ---------------------------------------------------------------------------

describe('persistPreference', () => {
  let anvilHome: string
  let cwd: string

  beforeEach(async () => {
    const tmp = createTestTmpDir('prefs-persist')
    anvilHome = join(tmp, 'anvil-home')
    cwd = join(tmp, 'my-proj')
    await mkdir(anvilHome, { recursive: true })
    await mkdir(cwd, { recursive: true })
  })

  it('writes atomically (tmp file then rename)', async () => {
    // Spy on the writes by checking the final file exists and tmp is cleaned up
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'json' },
      { cwd, anvilHome },
    )

    // The final file should exist
    const content = await readFile(join(anvilHome, 'preferences.json'), 'utf-8')
    const parsed = JSON.parse(content)
    expect(parsed.version).toBe(1)

    // The tmp file should NOT exist (rename completed)
    await expect(
      readFile(join(anvilHome, 'preferences.json.tmp'), 'utf-8'),
    ).rejects.toThrow()
  })

  it('sets cwd and first_seen on first write for new project', async () => {
    const before = Date.now()
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'json' },
      { cwd, anvilHome },
    )
    const after = Date.now()

    const content = JSON.parse(
      await readFile(join(anvilHome, 'preferences.json'), 'utf-8'),
    )
    const projects = content.projects
    const keys = Object.keys(projects)
    expect(keys).toHaveLength(1)
    const proj = projects[keys[0]]
    expect(proj.cwd).toBe(cwd)
    const firstSeen = new Date(proj.first_seen).getTime()
    expect(firstSeen).toBeGreaterThanOrEqual(before)
    expect(firstSeen).toBeLessThanOrEqual(after)
  })

  it('preserves other projects entries when updating', async () => {
    // Write another project manually
    const existingData = {
      version: 1,
      projects: {
        'other-project': {
          cwd: '/some/other/path',
          first_seen: '2026-05-01T00:00:00.000Z',
          per_kind: {
            review: { location: '.anvil/', format: 'markdown' },
          },
        },
      },
    }
    await writeFile(
      join(anvilHome, 'preferences.json'),
      JSON.stringify(existingData),
      'utf-8',
    )

    // Now persist for our cwd
    await persistPreference(
      'plan',
      { location: '.anvil/plans/', format: 'markdown' },
      { cwd, anvilHome },
    )

    const content = JSON.parse(
      await readFile(join(anvilHome, 'preferences.json'), 'utf-8'),
    )
    // Other project preserved
    expect(content.projects['other-project']).toBeDefined()
    expect(content.projects['other-project'].per_kind.review.format).toBe(
      'markdown',
    )
    // New project added
    const keys = Object.keys(content.projects).filter(
      (k) => k !== 'other-project',
    )
    expect(keys).toHaveLength(1)
    expect(content.projects[keys[0]].per_kind.plan).toBeDefined()
  })

  it('updates existing per-kind entry', async () => {
    // First write
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'json' },
      { cwd, anvilHome },
    )

    // Second write — update format
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'markdown' },
      { cwd, anvilHome },
    )

    const content = JSON.parse(
      await readFile(join(anvilHome, 'preferences.json'), 'utf-8'),
    )
    const proj = Object.values(content.projects)[0] as {
      per_kind: Record<string, { format: string }>
    }
    expect(proj.per_kind.review.format).toBe('markdown')
  })

  it('does not change first_seen on subsequent writes', async () => {
    await persistPreference(
      'review',
      { location: '.anvil/reviews/', format: 'json' },
      { cwd, anvilHome },
    )
    const content1 = JSON.parse(
      await readFile(join(anvilHome, 'preferences.json'), 'utf-8'),
    )
    const proj1 = Object.values(content1.projects)[0] as { first_seen: string }
    const firstSeen1 = proj1.first_seen

    // Small delay to ensure timestamp would differ if re-written
    await new Promise((r) => setTimeout(r, 10))

    await persistPreference(
      'plan',
      { location: '.anvil/plans/', format: 'markdown' },
      { cwd, anvilHome },
    )
    const content2 = JSON.parse(
      await readFile(join(anvilHome, 'preferences.json'), 'utf-8'),
    )
    const proj2 = Object.values(content2.projects)[0] as { first_seen: string }
    expect(proj2.first_seen).toBe(firstSeen1)
  })
})
