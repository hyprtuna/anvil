import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  unwireOpenCodeProject,
  unwireOpenCodeUser,
  wireOpenCodeProject,
  wireOpenCodeUser,
} from '../../src/installer/wire-opencode.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return createTestTmpDir('woc-test')
}

function makeAnvilHome(base: string): string {
  const anvilHome = join(base, 'anvil-home')
  mkdirSync(join(anvilHome, 'plugins', 'opencode'), { recursive: true })
  return anvilHome
}

function expectedUrl(anvilHome: string): string {
  return `file://${join(anvilHome, 'plugins', 'opencode', 'index.js')}`
}

function readConfig(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// User scope
// ---------------------------------------------------------------------------

describe('wireOpenCodeUser / unwireOpenCodeUser', () => {
  let tmpBase: string
  let anvilHome: string
  let fakeHome: string
  let originalHome: string | undefined
  let configPath: string

  beforeEach(() => {
    tmpBase = makeTmpDir()
    anvilHome = makeAnvilHome(tmpBase)
    fakeHome = join(tmpBase, 'fake-home')
    mkdirSync(join(fakeHome, '.config', 'opencode'), { recursive: true })
    originalHome = process.env.HOME
    process.env.HOME = fakeHome
    configPath = join(fakeHome, '.config', 'opencode', 'opencode.json')
  })

  afterEach(() => {
    process.env.HOME = originalHome
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it('wire on nonexistent file creates file with plugin URL', async () => {
    expect(existsSync(configPath)).toBe(false)
    await wireOpenCodeUser({ anvilHome })
    expect(existsSync(configPath)).toBe(true)
    const config = readConfig(configPath)
    const plugins = config.plugin as string[]
    expect(plugins).toContain(expectedUrl(anvilHome))
  })

  it('wire adds plugin URL exactly once (idempotent)', async () => {
    await wireOpenCodeUser({ anvilHome })
    await wireOpenCodeUser({ anvilHome })

    const config = readConfig(configPath)
    const plugins = config.plugin as string[]
    const url = expectedUrl(anvilHome)
    const count = plugins.filter((p) => p === url).length
    expect(count).toBe(1)
  })

  it('wire preserves unrelated keys', async () => {
    // Pre-populate with extra keys and another plugin
    writeFileSync(
      configPath,
      JSON.stringify({ theme: 'dark', plugin: ['file://other'] }, null, 2),
    )

    await wireOpenCodeUser({ anvilHome })

    const config = readConfig(configPath)
    expect(config.theme).toBe('dark')
    const plugins = config.plugin as string[]
    expect(plugins).toContain('file://other')
    expect(plugins).toContain(expectedUrl(anvilHome))
    expect(plugins).toHaveLength(2)
  })

  it('unwire removes only the Anvil plugin entry, keeps other plugins', async () => {
    writeFileSync(
      configPath,
      JSON.stringify({ plugin: ['file://other'] }, null, 2),
    )

    await wireOpenCodeUser({ anvilHome })
    await unwireOpenCodeUser({ anvilHome })

    const config = readConfig(configPath)
    const plugins = (config.plugin ?? []) as string[]
    expect(plugins).not.toContain(expectedUrl(anvilHome))
    expect(plugins).toContain('file://other')
  })

  it('unwire removes plugin key when no plugins remain', async () => {
    await wireOpenCodeUser({ anvilHome })
    await unwireOpenCodeUser({ anvilHome })

    const config = readConfig(configPath)
    expect(config.plugin).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Project scope
// ---------------------------------------------------------------------------

describe('wireOpenCodeProject / unwireOpenCodeProject', () => {
  let tmpBase: string
  let anvilHome: string
  let projectRoot: string

  beforeEach(() => {
    tmpBase = makeTmpDir()
    anvilHome = makeAnvilHome(tmpBase)
    projectRoot = join(tmpBase, 'project')
    mkdirSync(projectRoot, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it('wire on nonexistent file creates .opencode/opencode.json', async () => {
    await wireOpenCodeProject({ anvilHome, projectRoot })
    const configPath = join(projectRoot, '.opencode', 'opencode.json')
    expect(existsSync(configPath)).toBe(true)
    const config = readConfig(configPath)
    const plugins = config.plugin as string[]
    expect(plugins).toContain(expectedUrl(anvilHome))
  })

  it('wire adds plugin URL exactly once (idempotent)', async () => {
    await wireOpenCodeProject({ anvilHome, projectRoot })
    await wireOpenCodeProject({ anvilHome, projectRoot })

    const configPath = join(projectRoot, '.opencode', 'opencode.json')
    const config = readConfig(configPath)
    const plugins = config.plugin as string[]
    const url = expectedUrl(anvilHome)
    const count = plugins.filter((p) => p === url).length
    expect(count).toBe(1)
  })

  it('wire preserves unrelated keys', async () => {
    const configPath = join(projectRoot, '.opencode', 'opencode.json')
    mkdirSync(join(projectRoot, '.opencode'), { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({ theme: 'light', plugin: ['file://other'] }, null, 2),
    )

    await wireOpenCodeProject({ anvilHome, projectRoot })

    const config = readConfig(configPath)
    expect(config.theme).toBe('light')
    const plugins = config.plugin as string[]
    expect(plugins).toContain('file://other')
    expect(plugins).toContain(expectedUrl(anvilHome))
  })

  it('unwire removes only the Anvil plugin entry, keeps other plugins', async () => {
    const configPath = join(projectRoot, '.opencode', 'opencode.json')
    mkdirSync(join(projectRoot, '.opencode'), { recursive: true })
    writeFileSync(
      configPath,
      JSON.stringify({ plugin: ['file://other'] }, null, 2),
    )

    await wireOpenCodeProject({ anvilHome, projectRoot })
    await unwireOpenCodeProject({ anvilHome, projectRoot })

    const config = readConfig(configPath)
    const plugins = (config.plugin ?? []) as string[]
    expect(plugins).not.toContain(expectedUrl(anvilHome))
    expect(plugins).toContain('file://other')
  })

  it('throws when projectRoot is missing', async () => {
    await expect(wireOpenCodeProject({ anvilHome })).rejects.toThrow(
      'projectRoot is required',
    )
    await expect(unwireOpenCodeProject({ anvilHome })).rejects.toThrow(
      'projectRoot is required',
    )
  })
})
