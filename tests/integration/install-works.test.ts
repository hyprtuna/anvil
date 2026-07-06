import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ClaudeCodePluginManifest } from '../../src/core/manifest-schema/claude-code.js'
import { buildContextFromRepo } from '../../src/installer/context-from-repo.js'
import { syncAnvilHome } from '../../src/installer/sync.js'
import { applyTargets } from '../../src/installer/wire.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('integration/install-works (claude-code)', () => {
  let anvilHome: string
  let projectRoot: string
  let fakeHomeForAfterAll: string

  afterAll(async () => {
    const { rmSync } = await import('node:fs')
    rmSync(fakeHomeForAfterAll, { recursive: true, force: true })
    rmSync(projectRoot, { recursive: true, force: true })
  })

  beforeAll(async () => {
    // Use a fully isolated fake home so we don't pollute ~/.anvil
    const fakeHome = createTestTmpDir('install-home')
    fakeHomeForAfterAll = fakeHome
    projectRoot = createTestTmpDir('install-proj')
    anvilHome = join(fakeHome, '.anvil')
    await mkdir(anvilHome, { recursive: true })

    // Override HOME so wireClaudeCodeProject's isAnvilUserScopeInstalled()
    // check reads the isolated plugins registry rather than the host's real
    // ~/.claude/plugins/installed_plugins.json — otherwise a host that already
    // has anvil@anvil registered skips the hook merge and this test's
    // settings.json assertion fails.
    const origHome = process.env.HOME
    process.env.HOME = fakeHome

    try {
      const ctx = await buildContextFromRepo({
        sourceKind: 'local',
        sourceValue: projectRoot,
        scope: 'project',
        preset: 'balanced',
        home: fakeHome,
      })

      await syncAnvilHome({ ctx, target: anvilHome })
      await applyTargets(['cc-project'], { anvilHome, projectRoot })
    } finally {
      if (origHome !== undefined) process.env.HOME = origHome
      // biome-ignore lint/performance/noDelete: same rationale as opencode block.
      else delete process.env.HOME
    }
  })

  it('writes a schema-valid plugins/claude-code/.claude-plugin/plugin.json', async () => {
    const raw = await readFile(
      join(
        anvilHome,
        'plugins',
        'claude-code',
        '.claude-plugin',
        'plugin.json',
      ),
      'utf-8',
    )
    const parsed = ClaudeCodePluginManifest.parse(JSON.parse(raw))
    expect(parsed.name).toBe('anvil')
    expect(parsed.hooks).toBeDefined()
  })

  it('writes skills as skills/<name>/SKILL.md subdirs', async () => {
    const entries = await readdir(join(anvilHome, 'skills'), {
      withFileTypes: true,
    })
    const skillDirs = entries.filter((e) => e.isDirectory())
    expect(skillDirs.length).toBeGreaterThanOrEqual(10)
    const first = skillDirs[0].name
    const inner = await readdir(join(anvilHome, 'skills', first))
    expect(inner).toContain('SKILL.md')
  })

  it('writes agents/ with code-reviewer.md', async () => {
    const agents = await readdir(join(anvilHome, 'agents'))
    expect(agents).toContain('code-reviewer.md')
  })

  it('writes executable hook scripts under hooks/', async () => {
    const hooksDir = join(anvilHome, 'hooks')
    const entries = await readdir(hooksDir)
    const cjs = entries.filter((f) => f.endsWith('.cjs'))
    expect(cjs.length).toBeGreaterThan(0)
    const st = await stat(join(hooksDir, cjs[0]))
    expect((st.mode & 0o111) !== 0).toBe(true)
  })

  it('wires .claude/settings.json in project root with _anvilOwned hooks in matcher format', async () => {
    const raw = await readFile(
      join(projectRoot, '.claude', 'settings.json'),
      'utf-8',
    )
    const settings = JSON.parse(raw) as {
      hooks?: Record<
        string,
        Array<{ matcher?: string; hooks?: unknown[]; _anvilOwned?: boolean }>
      >
    }
    expect(settings.hooks).toBeDefined()
    const allHookEntries = Object.values(settings.hooks ?? {}).flat()
    const anvilEntries = allHookEntries.filter((e) => e._anvilOwned === true)
    expect(anvilEntries.length).toBeGreaterThan(0)
    // Each anvil entry must use the Claude Code matcher+hooks wrapper format
    for (const entry of anvilEntries) {
      expect(typeof entry.matcher).toBe('string')
      expect(Array.isArray(entry.hooks)).toBe(true)
    }
  })
})

describe('integration/install-works (opencode)', () => {
  let anvilHome: string
  let fakeHome: string
  let origHome: string | undefined
  let ocProjectRoot: string

  afterAll(async () => {
    const { rmSync } = await import('node:fs')
    rmSync(fakeHome, { recursive: true, force: true })
    rmSync(ocProjectRoot, { recursive: true, force: true })
  })

  beforeAll(async () => {
    fakeHome = createTestTmpDir('oc-install-home')
    const projectRoot = createTestTmpDir('oc-install-proj')
    ocProjectRoot = projectRoot
    anvilHome = join(fakeHome, '.anvil')
    await mkdir(anvilHome, { recursive: true })

    // Override HOME so wireOpenCodeUser writes to fakeHome, not the real ~/.config
    origHome = process.env.HOME
    process.env.HOME = fakeHome

    const ctx = await buildContextFromRepo({
      sourceKind: 'local',
      sourceValue: projectRoot,
      scope: 'project',
      preset: 'balanced',
      home: fakeHome,
    })

    await syncAnvilHome({ ctx, target: anvilHome })
    await applyTargets(['oc-user', 'oc-project'], { anvilHome, projectRoot })

    // Restore HOME immediately after wiring so the rest of the suite is unaffected.
    if (origHome !== undefined) process.env.HOME = origHome
    // biome-ignore lint/performance/noDelete: process.env.HOME = undefined stores the string "undefined"; delete is the only way to unset an env var at runtime.
    else delete process.env.HOME
  })

  it('writes plugins/opencode/package.json as valid JSON (v2 layout)', async () => {
    const raw = await readFile(
      join(anvilHome, 'plugins', 'opencode', 'package.json'),
      'utf-8',
    )
    const parsed = JSON.parse(raw)
    expect(parsed).toBeDefined()
    expect(typeof parsed).toBe('object')
    expect(parsed.name).toBe('@anvil/opencode-plugin')
  })

  it('writes plugins/opencode/index.js (v2 layout)', async () => {
    const src = await readFile(
      join(anvilHome, 'plugins', 'opencode', 'index.js'),
      'utf-8',
    )
    expect(typeof src).toBe('string')
    expect(src.length).toBeGreaterThan(0)
  })

  it('writes skills under skills/<name>/SKILL.md', async () => {
    const entries = await readdir(join(anvilHome, 'skills'), {
      withFileTypes: true,
    })
    const skillDirs = entries.filter((e) => e.isDirectory())
    expect(skillDirs.length).toBeGreaterThanOrEqual(10)
  })

  it('writes executable hook scripts under hooks/', async () => {
    const hooksDir = join(anvilHome, 'hooks')
    const entries = await readdir(hooksDir)
    const cjs = entries.filter((f) => f.endsWith('.cjs'))
    expect(cjs.length).toBeGreaterThan(0)
    const st = await stat(join(hooksDir, cjs[0]))
    expect((st.mode & 0o111) !== 0).toBe(true)
  })
})
