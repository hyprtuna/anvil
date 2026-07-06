import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock child_process so claudeAvailable() always returns false (forces filesystem fallback)
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(() => ({ status: 1 })),
}))

import {
  unwireClaudeCodeProject,
  unwireClaudeCodeUser,
  wireClaudeCodeProject,
  wireClaudeCodeUser,
} from '../../src/installer/wire-claude-code.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return createTestTmpDir('wcc-test')
}

/** Build a minimal anvilHome fixture on disk */
function makeAnvilHome(base: string): string {
  const anvilHome = join(base, 'anvil-home')
  mkdirSync(join(anvilHome, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(anvilHome, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'anvil', plugins: [] }),
  )
  writeFileSync(join(anvilHome, 'version'), '0.2.0+abc\n')
  mkdirSync(join(anvilHome, 'plugins', 'claude-code'), { recursive: true })
  return anvilHome
}

/** Build a project-scope anvilHome that also includes plugin.json */
function makeAnvilHomeWithPlugin(base: string): string {
  const anvilHome = makeAnvilHome(base)
  const pluginDir = join(anvilHome, 'plugins', 'claude-code', '.claude-plugin')
  mkdirSync(pluginDir, { recursive: true })
  writeFileSync(
    join(pluginDir, 'plugin.json'),
    JSON.stringify({
      name: 'anvil',
      hooks: {
        SessionStart: [
          {
            matcher: '',
            hooks: [
              {
                type: 'command',
                command: '${CLAUDE_PLUGIN_ROOT}/hooks/session-start.cjs',
              },
            ],
          },
        ],
      },
    }),
  )
  return anvilHome
}

// ---------------------------------------------------------------------------
// User scope
// ---------------------------------------------------------------------------

describe('wireClaudeCodeUser / unwireClaudeCodeUser', () => {
  let tmpBase: string
  let anvilHome: string
  let fakeHome: string
  let originalHome: string | undefined

  beforeEach(() => {
    tmpBase = makeTmpDir()
    anvilHome = makeAnvilHome(tmpBase)
    fakeHome = join(tmpBase, 'fake-home')
    mkdirSync(fakeHome, { recursive: true })
    originalHome = process.env.HOME
    process.env.HOME = fakeHome
  })

  afterEach(() => {
    process.env.HOME = originalHome
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it('creates marketplace dir, cache symlink, and registry entry', async () => {
    await wireClaudeCodeUser({ anvilHome })

    // marketplace.json should be written
    const marketplacePath = join(
      fakeHome,
      '.claude',
      'plugins',
      'marketplaces',
      'anvil',
      '.claude-plugin',
      'marketplace.json',
    )
    expect(existsSync(marketplacePath)).toBe(true)

    // cache symlink at version 0.2.0
    const cacheVersionDir = join(
      fakeHome,
      '.claude',
      'plugins',
      'cache',
      'anvil',
      'anvil',
      '0.2.0',
    )
    expect(existsSync(cacheVersionDir)).toBe(true)

    // installed_plugins.json has anvil@anvil entry
    const registryPath = join(
      fakeHome,
      '.claude',
      'plugins',
      'installed_plugins.json',
    )
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as Record<
      string,
      unknown
    >
    expect(registry).toHaveProperty('anvil@anvil')
    const entry = registry['anvil@anvil'] as Record<string, unknown>
    expect(entry.scope).toBe('user')
  })

  it('is idempotent — second call does not add duplicate registry entry', async () => {
    await wireClaudeCodeUser({ anvilHome })
    await wireClaudeCodeUser({ anvilHome })

    const registryPath = join(
      fakeHome,
      '.claude',
      'plugins',
      'installed_plugins.json',
    )
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8')) as Record<
      string,
      unknown
    >

    // Should still have exactly one entry, not duplicated
    const keys = Object.keys(registry).filter((k) => k === 'anvil@anvil')
    expect(keys).toHaveLength(1)
  })

  it('unwire removes what wire added', async () => {
    await wireClaudeCodeUser({ anvilHome })
    await unwireClaudeCodeUser({ anvilHome })

    // marketplace dir should be gone
    const marketRoot = join(
      fakeHome,
      '.claude',
      'plugins',
      'marketplaces',
      'anvil',
    )
    expect(existsSync(marketRoot)).toBe(false)

    // cache symlink should be gone
    const cacheVersionDir = join(
      fakeHome,
      '.claude',
      'plugins',
      'cache',
      'anvil',
      'anvil',
      '0.2.0',
    )
    expect(existsSync(cacheVersionDir)).toBe(false)

    // anvil@anvil should not be in registry
    const registryPath = join(
      fakeHome,
      '.claude',
      'plugins',
      'installed_plugins.json',
    )
    if (existsSync(registryPath)) {
      const registry = JSON.parse(
        readFileSync(registryPath, 'utf-8'),
      ) as Record<string, unknown>
      expect(registry).not.toHaveProperty('anvil@anvil')
    }
  })
})

// ---------------------------------------------------------------------------
// Project scope
// ---------------------------------------------------------------------------

describe('wireClaudeCodeProject / unwireClaudeCodeProject', () => {
  let tmpBase: string
  let anvilHome: string
  let projectRoot: string
  let fakeHome: string
  let originalHome: string | undefined

  beforeEach(() => {
    tmpBase = makeTmpDir()
    anvilHome = makeAnvilHomeWithPlugin(tmpBase)
    projectRoot = join(tmpBase, 'project')
    mkdirSync(projectRoot, { recursive: true })
    // Isolate HOME so isAnvilUserScopeInstalled() doesn't read the host's
    // real ~/.claude/plugins/installed_plugins.json.
    fakeHome = join(tmpBase, 'fake-home')
    mkdirSync(fakeHome, { recursive: true })
    originalHome = process.env.HOME
    process.env.HOME = fakeHome
  })

  afterEach(() => {
    process.env.HOME = originalHome
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it('creates symlinks in .claude/ for skills, agents, commands, hooks', async () => {
    // Create the canonical dirs in anvilHome so symlinks have real targets
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({ anvilHome, projectRoot })

    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      const linkPath = join(projectRoot, '.claude', dir)
      expect(existsSync(linkPath)).toBe(true)
      expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
    }
  })

  it('merges hooks into .claude/settings.json with _anvilOwned marker', async () => {
    await wireClaudeCodeProject({ anvilHome, projectRoot })

    const settingsPath = join(projectRoot, '.claude', 'settings.json')
    expect(existsSync(settingsPath)).toBe(true)

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks?: Record<
        string,
        Array<{ _anvilOwned?: boolean; hooks?: Array<{ command: string }> }>
      >
    }

    expect(settings.hooks).toBeDefined()
    const sessionStart = settings.hooks?.SessionStart
    expect(sessionStart).toBeDefined()
    expect(sessionStart?.length).toBeGreaterThan(0)

    const anvilHook = sessionStart?.find((e) => e._anvilOwned === true)
    expect(anvilHook).toBeDefined()
    // Command should have anvilHome embedded (CLAUDE_PLUGIN_ROOT replaced)
    expect(anvilHook?.hooks?.[0]?.command).toContain(anvilHome)
  })

  it('unwire removes symlinks and splices only _anvilOwned hooks, preserving user hooks', async () => {
    // Create the four target dirs so symlinks are non-dangling
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    // Pre-populate settings.json with a user hook
    const claudeDir = join(projectRoot, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    const existingSettings = {
      hooks: {
        SessionStart: [
          {
            type: 'command',
            command: '/usr/bin/my-custom-hook',
            _anvilOwned: false,
          },
        ],
      },
    }
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify(existingSettings, null, 2),
    )

    await wireClaudeCodeProject({ anvilHome, projectRoot })
    await unwireClaudeCodeProject({ anvilHome, projectRoot })

    // Symlinks should be gone — use lstatSync to detect even dangling symlinks
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      const linkPath = join(claudeDir, dir)
      expect(() => lstatSync(linkPath)).toThrow()
    }

    // User hook should still be present
    const settingsPath = join(claudeDir, 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        hooks?: Record<
          string,
          Array<{ _anvilOwned?: boolean; command: string }>
        >
      }
      const sessionStart = settings.hooks?.SessionStart ?? []
      const userHook = sessionStart.find(
        (e) => e.command === '/usr/bin/my-custom-hook',
      )
      expect(userHook).toBeDefined()

      // No anvil-owned hooks
      const anvilHooks = sessionStart.filter((e) => e._anvilOwned === true)
      expect(anvilHooks).toHaveLength(0)
    }
  })

  it('is idempotent — calling twice does not duplicate hooks', async () => {
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }
    await wireClaudeCodeProject({ anvilHome, projectRoot })
    await wireClaudeCodeProject({ anvilHome, projectRoot }) // second call must not throw

    const settingsPath = join(projectRoot, '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      hooks?: Record<string, Array<{ _anvilOwned?: boolean }>>
    }
    const sessionStart = (settings.hooks?.SessionStart ?? []) as Array<{
      _anvilOwned?: boolean
    }>
    const anvilHooks = sessionStart.filter((e) => e._anvilOwned === true)
    expect(anvilHooks).toHaveLength(1) // not doubled
  })

  it('skips settings.json hook merge when the user-scope plugin is installed (v2 nested format)', async () => {
    // Simulate a `claude plugin install`-written installed_plugins.json.
    const pluginsRoot = join(fakeHome, '.claude', 'plugins')
    mkdirSync(pluginsRoot, { recursive: true })
    writeFileSync(
      join(pluginsRoot, 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'anvil@anvil': [{ scope: 'user', version: '0.2.0' }],
        },
      }),
    )
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({ anvilHome, projectRoot })

    const settingsPath = join(projectRoot, '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        hooks?: Record<string, Array<{ _anvilOwned?: boolean }>>
      }
      const anvilHooks = Object.values(settings.hooks ?? {})
        .flat()
        .filter((e) => e._anvilOwned === true)
      expect(anvilHooks).toHaveLength(0) // no duplicate with user-scope plugin
    }
  })

  it('purges stale _anvilOwned hooks when user-scope plugin is now present', async () => {
    // Pre-seed project settings with a stale anvil-owned hook (v0.2.3 state).
    const claudeDir = join(projectRoot, '.claude')
    mkdirSync(claudeDir, { recursive: true })
    writeFileSync(
      join(claudeDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            {
              matcher: '',
              hooks: [
                { type: 'command', command: '/home/x/.anvil/old/hook.cjs' },
              ],
              _anvilOwned: true,
            },
          ],
        },
      }),
    )
    // Register the user-scope plugin so the wire should skip + purge.
    const pluginsRoot = join(fakeHome, '.claude', 'plugins')
    mkdirSync(pluginsRoot, { recursive: true })
    writeFileSync(
      join(pluginsRoot, 'installed_plugins.json'),
      JSON.stringify({ 'anvil@anvil': { scope: 'user' } }),
    )
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({ anvilHome, projectRoot })

    const settings = JSON.parse(
      readFileSync(join(claudeDir, 'settings.json'), 'utf-8'),
    ) as { hooks?: Record<string, unknown[]> }
    // UserPromptSubmit should be purged entirely since only anvil owned it.
    expect(settings.hooks?.UserPromptSubmit).toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Statusline (v0.2.5)
  // -------------------------------------------------------------------------

  it('merges statusLine (anvil statusline TS renderer) into settings.json when statusline:true', async () => {
    // Plan 28 C5: the bash script copy was retired. The wire now points
    // statusLine.command at `<anvilHome>/bin/anvil.cjs statusline` so the
    // TS renderer (rate-limits, ctx, agent, etc.) drives the status line.
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({
      anvilHome,
      projectRoot,
      statusline: true,
    })

    // The bash script must NOT be copied any more.
    const scriptPath = join(projectRoot, '.claude', 'statusline.sh')
    expect(existsSync(scriptPath)).toBe(false)

    const settingsPath = join(projectRoot, '.claude', 'settings.json')
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
      statusLine?: {
        type?: string
        command?: string
        padding?: number
        refreshInterval?: number
      }
    }
    expect(settings.statusLine?.type).toBe('command')
    expect(settings.statusLine?.command).toBe(
      `${join(anvilHome, 'bin', 'anvil.cjs')} statusline`,
    )
    expect(settings.statusLine?.padding).toBe(0)
    expect(settings.statusLine?.refreshInterval).toBe(5)
  })

  it('does not touch statusLine in settings when statusline is omitted', async () => {
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({ anvilHome, projectRoot })

    expect(existsSync(join(projectRoot, '.claude', 'statusline.sh'))).toBe(
      false,
    )
    const settingsPath = join(projectRoot, '.claude', 'settings.json')
    if (existsSync(settingsPath)) {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as {
        statusLine?: unknown
      }
      expect(settings.statusLine).toBeUndefined()
    }
  })

  it('statusline wiring is idempotent (second call stable, no duplicate keys)', async () => {
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({
      anvilHome,
      projectRoot,
      statusline: true,
    })
    const settingsPath = join(projectRoot, '.claude', 'settings.json')
    const firstPass = readFileSync(settingsPath, 'utf-8')

    await wireClaudeCodeProject({
      anvilHome,
      projectRoot,
      statusline: true,
    })
    expect(readFileSync(settingsPath, 'utf-8')).toBe(firstPass)
  })

  it('statusline applies even when the user-scope plugin is already installed', async () => {
    const pluginsRoot = join(fakeHome, '.claude', 'plugins')
    mkdirSync(pluginsRoot, { recursive: true })
    writeFileSync(
      join(pluginsRoot, 'installed_plugins.json'),
      JSON.stringify({ 'anvil@anvil': { scope: 'user' } }),
    )
    for (const dir of ['skills', 'agents', 'commands', 'hooks']) {
      mkdirSync(join(anvilHome, dir), { recursive: true })
    }

    await wireClaudeCodeProject({
      anvilHome,
      projectRoot,
      statusline: true,
    })

    const settings = JSON.parse(
      readFileSync(join(projectRoot, '.claude', 'settings.json'), 'utf-8'),
    ) as { statusLine?: { command?: string } }
    expect(settings.statusLine?.command).toBe(
      `${join(anvilHome, 'bin', 'anvil.cjs')} statusline`,
    )
  })
})
