/**
 * Phase 2 (v0.11.2 Bundle A) — unit tests for the manifest-driven skill
 * registration in AnvilPlugin().config().
 *
 * ANVIL_ROOT_OVERRIDE env hatch lets us point the plugin at a temp dir without
 * touching the real ~/.anvil/. The hatch is checked at AnvilPlugin() call time
 * (resolveAnvilRoot() is called inside AnvilPlugin()), so setting the env var
 * before the call is sufficient.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AnvilPlugin } from '../../../src/opencode-plugin/index.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

let tmpRoot: string

beforeAll(() => {
  tmpRoot = createTestTmpDir('oc-cfg')
})

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

afterEach(() => {
  process.env.ANVIL_ROOT_OVERRIDE = undefined
})

/**
 * Write a manifest.json into anvilRoot with the given skill entries.
 * Uses the ANV-0014 versioned shape so the plugin accepts it.
 */
function writeManifest(
  anvilRoot: string,
  skills: Array<{ name: string; enabled: boolean }>,
): void {
  writeFileSync(
    join(anvilRoot, 'manifest.json'),
    JSON.stringify({
      schemaVersion: 'anvil.opencode.v1',
      installedTarget: 'opencode',
      installedAt: new Date().toISOString(),
      skills: skills.map((s) => ({
        ...s,
        sourcePath: join(anvilRoot, 'skills', s.name, 'SKILL.md'),
      })),
    }),
    'utf-8',
  )
}

/**
 * Create a skill directory with a SKILL.md stub under anvilRoot/skills/<name>.
 */
function createSkillDir(anvilRoot: string, name: string): string {
  const skillDir = join(anvilRoot, 'skills', name)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), `# ${name}\n`, 'utf-8')
  return skillDir
}

/**
 * Stage the using-anvil bootstrap skill the OC plugin requires (ANV-0013).
 * Without this, AnvilPlugin() throws on the missing bootstrap path.
 */
function stageBootstrap(anvilRoot: string): void {
  createSkillDir(anvilRoot, 'using-anvil')
}

describe('AnvilPlugin config() — skill registration', () => {
  it('happy path: registers all enabled skills + bootstrap; skips disabled', async () => {
    const anvilRoot = mkdtempSync(join(tmpRoot, 'happy-'))
    stageBootstrap(anvilRoot)
    // Create skill directories
    createSkillDir(anvilRoot, 'skill-alpha')
    createSkillDir(anvilRoot, 'skill-beta')
    createSkillDir(anvilRoot, 'skill-gamma')
    createSkillDir(anvilRoot, 'skill-disabled')

    writeManifest(anvilRoot, [
      { name: 'skill-alpha', enabled: true },
      { name: 'skill-beta', enabled: true },
      { name: 'skill-gamma', enabled: true },
      { name: 'skill-disabled', enabled: false },
    ])

    process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
    const plugin = await AnvilPlugin()
    const cfg: { skills?: { paths?: string[] } } = {}
    await plugin.config(cfg)

    expect(cfg.skills?.paths).toBeDefined()
    const paths = cfg.skills!.paths!

    // 3 enabled skills + 1 bootstrap (skills/ dir)
    expect(paths.length).toBe(4)
    expect(paths).toContain(join(anvilRoot, 'skills', 'skill-alpha'))
    expect(paths).toContain(join(anvilRoot, 'skills', 'skill-beta'))
    expect(paths).toContain(join(anvilRoot, 'skills', 'skill-gamma'))
    // Disabled skill must NOT be present
    expect(paths).not.toContain(join(anvilRoot, 'skills', 'skill-disabled'))
    // Bootstrap dir (join(anvilRoot, 'skills')) must be present
    expect(paths).toContain(join(anvilRoot, 'skills'))
  })

  it('manifest-missing: falls back to bootstrap only, no stderr (graceful no-op,)', async () => {
    // ANV-0014: absent manifest is a normal condition (fresh env before first
    // `anvil init`). Plugin must silently return [] — no stderr noise.
    const anvilRoot = mkdtempSync(join(tmpRoot, 'missing-'))
    stageBootstrap(anvilRoot)
    // No manifest.json written

    let stderrLine = ''
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: unknown) => {
      if (typeof chunk === 'string') stderrLine += chunk
      return origWrite(chunk)
    }

    process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
    const plugin = await AnvilPlugin()
    const cfg: { skills?: { paths?: string[] } } = {}
    await plugin.config(cfg)

    // Restore stderr
    process.stderr.write = origWrite

    const paths = cfg.skills?.paths ?? []
    // Only the bootstrap dir — no skills from manifest
    expect(paths.length).toBe(1)
    expect(paths[0]).toBe(join(anvilRoot, 'skills'))
    // No stderr for an absent manifest (graceful no-op).
    expect(stderrLine).toBe('')
  })

  it('manifest-corrupt: falls back to bootstrap only, emits structured stderr', async () => {
    // ANV-0014: present but invalid JSON → structured error, not silent.
    const anvilRoot = mkdtempSync(join(tmpRoot, 'corrupt-'))
    stageBootstrap(anvilRoot)
    writeFileSync(
      join(anvilRoot, 'manifest.json'),
      '{ not: valid json',
      'utf-8',
    )

    let stderrLine = ''
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: unknown) => {
      if (typeof chunk === 'string') stderrLine += chunk
      return origWrite(chunk)
    }

    process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
    const plugin = await AnvilPlugin()
    const cfg: { skills?: { paths?: string[] } } = {}
    await plugin.config(cfg)

    process.stderr.write = origWrite

    const paths = cfg.skills?.paths ?? []
    expect(paths.length).toBe(1)
    // Structured error must reference the file and repair action.
    expect(stderrLine).toContain(
      '[anvil] opencode-plugin: manifest.json contains invalid JSON',
    )
    expect(stderrLine).toContain('anvil init')
  })

  it('manifest-stale: schemaVersion mismatch emits structured stderr', async () => {
    // ANV-0014: manifest present with wrong schemaVersion → loud error.
    const anvilRoot = mkdtempSync(join(tmpRoot, 'stale-'))
    stageBootstrap(anvilRoot)
    writeFileSync(
      join(anvilRoot, 'manifest.json'),
      JSON.stringify({
        installedTarget: 'opencode',
        installedAt: new Date().toISOString(),
      }),
      'utf-8',
    )

    let stderrLine = ''
    const origWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk: unknown) => {
      if (typeof chunk === 'string') stderrLine += chunk
      return origWrite(chunk)
    }

    process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
    const plugin = await AnvilPlugin()
    const cfg: { skills?: { paths?: string[] } } = {}
    await plugin.config(cfg)

    process.stderr.write = origWrite

    const paths = cfg.skills?.paths ?? []
    expect(paths.length).toBe(1)
    // Must mention the expected schema version and repair action.
    expect(stderrLine).toContain('schemaVersion')
    expect(stderrLine).toContain('anvil.opencode.v1')
    expect(stderrLine).toContain('anvil init')
  })

  it('returns without throwing when invoked with undefined cfg (OC 1.15.3 startup path)', async () => {
    const anvilRoot = mkdtempSync(join(tmpRoot, 'undef-'))
    stageBootstrap(anvilRoot)
    process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
    const plugin = await AnvilPlugin()
    // OC 1.15.3 calls config() with undefined during provider-list bootstrap.
    // Plugin must no-op, NOT throw "undefined is not an object".
    await expect(
      (plugin.config as (c?: unknown) => Promise<void>)(undefined),
    ).resolves.toBeUndefined()
  })

  it('idempotent: calling config() twice does not grow the paths array', async () => {
    const anvilRoot = mkdtempSync(join(tmpRoot, 'idem-'))
    stageBootstrap(anvilRoot)
    createSkillDir(anvilRoot, 'skill-x')
    writeManifest(anvilRoot, [{ name: 'skill-x', enabled: true }])

    process.env.ANVIL_ROOT_OVERRIDE = anvilRoot
    const plugin = await AnvilPlugin()
    const cfg: { skills?: { paths?: string[] } } = {}
    await plugin.config(cfg)
    const lengthAfterFirst = cfg.skills!.paths!.length

    await plugin.config(cfg)
    expect(cfg.skills!.paths!.length).toBe(lengthAfterFirst)
  })
})
