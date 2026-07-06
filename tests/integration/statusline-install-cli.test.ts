/**
 * Plan 33 Phase E6 — Integration tests for `anvil statusline install`.
 *
 * Tests:
 *   - project scope + anvil mode writes expected block
 *   - global scope writes to sandbox HOME/.claude/settings.json
 *   - shell-script mode copies the template
 *   - idempotency: re-running same args → no diff
 *   - --force overwrites custom commands; without it refuses to clobber
 */
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { statuslineInstallCommand } from '../../src/commands/cli/statusline-install.js'

let tmpHome: string
let tmpProject: string

beforeEach(async () => {
  const ts = Date.now()
  tmpHome = join(tmpdir(), `anvil-sl-install-home-${ts}`)
  tmpProject = join(tmpdir(), `anvil-sl-install-proj-${ts}`)
  await mkdir(join(tmpHome, '.anvil', 'bin'), { recursive: true })
  await mkdir(join(tmpProject, '.claude'), { recursive: true })
  // Write a fake anvil binary reference (just a path that "exists" for the test)
  await writeFile(
    join(tmpHome, '.anvil', 'bin', 'anvil.cjs'),
    '#!/usr/bin/env node\n',
    'utf-8',
  )
  vi.stubEnv('HOME', tmpHome)
  vi.stubEnv('ANVIL_OUTPUT_FORMAT', 'text')
})

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true })
  await rm(tmpProject, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

// ---------------------------------------------------------------------------
// Project scope — anvil mode (default)
// ---------------------------------------------------------------------------

describe('anvil statusline install --scope project --mode anvil', () => {
  it('writes statusLine block pointing to anvil statusline', async () => {
    const written: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      written.push(s as string)
      return true
    })

    await statuslineInstallCommand({
      scope: 'project',
      mode: 'anvil',
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    expect(existsSync(settingsPath), 'settings.json should exist').toBe(true)
    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const sl = settings.statusLine as Record<string, unknown>
    expect(sl).toBeDefined()
    expect(sl.type).toBe('command')
    expect(typeof sl.command).toBe('string')
    expect(sl.command as string).toContain('statusline')
    // Should reference anvil binary
    const output = written.join('')
    expect(output).toMatch(/statusLine/)
  })

  it('is idempotent: re-running same args produces no diff', async () => {
    const written: string[] = []
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      written.push(s as string)
      return true
    })

    const opts = {
      scope: 'project' as const,
      mode: 'anvil' as const,
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    }
    await statuslineInstallCommand(opts)

    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const contentAfterFirst = await readFile(settingsPath, 'utf-8')

    // Second run
    await statuslineInstallCommand(opts)
    const contentAfterSecond = await readFile(settingsPath, 'utf-8')

    expect(contentAfterFirst).toBe(contentAfterSecond)
  })

  it('preserves existing keys in settings.json', async () => {
    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const existing = {
      permissions: { defaultMode: 'acceptEdits' },
      someKey: 42,
    }
    await writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf-8')

    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await statuslineInstallCommand({
      scope: 'project',
      mode: 'anvil',
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    // Existing keys preserved
    expect(settings.someKey).toBe(42)
    // StatusLine added
    expect(settings.statusLine).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Global scope — anvil mode
// ---------------------------------------------------------------------------

describe('anvil statusline install --scope global --mode anvil', () => {
  it('writes to HOME/.claude/settings.json', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await mkdir(join(tmpHome, '.claude'), { recursive: true })
    await statuslineInstallCommand({
      scope: 'global',
      mode: 'anvil',
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    const settingsPath = join(tmpHome, '.claude', 'settings.json')
    expect(existsSync(settingsPath), 'global settings.json should exist').toBe(
      true,
    )
    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const sl = settings.statusLine as Record<string, unknown>
    expect(sl).toBeDefined()
    expect(sl.type).toBe('command')
    expect(sl.command as string).toContain('statusline')
  })

  it('is idempotent for global scope', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await mkdir(join(tmpHome, '.claude'), { recursive: true })
    const opts = {
      scope: 'global' as const,
      mode: 'anvil' as const,
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    }

    await statuslineInstallCommand(opts)
    const settingsPath = join(tmpHome, '.claude', 'settings.json')
    const after1 = await readFile(settingsPath, 'utf-8')
    await statuslineInstallCommand(opts)
    const after2 = await readFile(settingsPath, 'utf-8')

    expect(after1).toBe(after2)
  })
})

// ---------------------------------------------------------------------------
// Shell-script mode
// ---------------------------------------------------------------------------

describe('anvil statusline install --mode shell-script', () => {
  it('copies statusline.sh template and wires bash command (project scope)', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await statuslineInstallCommand({
      scope: 'project',
      mode: 'shell-script',
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    const scriptPath = join(tmpProject, '.claude', 'statusline-command.sh')
    expect(
      existsSync(scriptPath),
      'statusline-command.sh should be copied',
    ).toBe(true)

    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const sl = settings.statusLine as Record<string, unknown>
    expect(sl).toBeDefined()
    expect(sl.type).toBe('command')
    expect(sl.command as string).toContain('statusline-command.sh')
    expect(sl.command as string).toContain('bash')
  })

  it('copies statusline.sh template to global scope', async () => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await mkdir(join(tmpHome, '.claude'), { recursive: true })
    await statuslineInstallCommand({
      scope: 'global',
      mode: 'shell-script',
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    const scriptPath = join(tmpHome, '.claude', 'statusline-command.sh')
    expect(
      existsSync(scriptPath),
      'global statusline-command.sh should be copied',
    ).toBe(true)

    const settingsPath = join(tmpHome, '.claude', 'settings.json')
    const raw = await readFile(settingsPath, 'utf-8')
    const settings = JSON.parse(raw) as Record<string, unknown>
    const sl = settings.statusLine as Record<string, unknown>
    expect(sl.command as string).toContain('statusline-command.sh')
  })
})

// ---------------------------------------------------------------------------
// --force flag
// ---------------------------------------------------------------------------

describe('--force flag behavior', () => {
  it('without --force, refuses to clobber custom statusLine command and warns', async () => {
    const stderrWrites: string[] = []
    vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
      stderrWrites.push(s as string)
      return true
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    // Pre-populate with custom command
    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const existing = {
      statusLine: { type: 'command', command: 'bash ~/custom-statusline.sh' },
    }
    await writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf-8')

    await statuslineInstallCommand({
      scope: 'project',
      mode: 'anvil',
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    // The file should not have been overwritten with anvil command
    const after = JSON.parse(await readFile(settingsPath, 'utf-8')) as Record<
      string,
      unknown
    >
    const sl = after.statusLine as Record<string, unknown>
    expect(sl.command as string).toContain('custom-statusline.sh')
    // A warning should have been emitted
    const errOut = stderrWrites.join('')
    expect(errOut).toMatch(/force/i)
  })

  it('with --force, overwrites custom command', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const existing = {
      statusLine: { type: 'command', command: 'bash ~/custom-statusline.sh' },
    }
    await writeFile(settingsPath, JSON.stringify(existing, null, 2), 'utf-8')

    await statuslineInstallCommand({
      scope: 'project',
      mode: 'anvil',
      force: true,
      cwd: tmpProject,
      anvilHome: join(tmpHome, '.anvil'),
    })

    const after = JSON.parse(await readFile(settingsPath, 'utf-8')) as Record<
      string,
      unknown
    >
    const sl = after.statusLine as Record<string, unknown>
    expect(sl.command as string).toContain('statusline')
    expect(sl.command as string).not.toContain('custom')
  })
})
