import { execSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { persistPreference } from '../../src/core/preferences.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const binPath = join(__dirname, '..', '..', 'bin', 'anvil.cjs')

function runAnvil(
  args: string,
  opts?: { env?: NodeJS.ProcessEnv; cwd?: string },
): string {
  return execSync(`node ${binPath} ${args}`, {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...opts?.env },
    cwd: opts?.cwd,
  })
}

describe('integration: anvil projects', () => {
  let tmpDir: string
  let anvilHome: string
  let projectDir: string

  beforeEach(async () => {
    tmpDir = createTestTmpDir('cli-projects')
    anvilHome = join(tmpDir, 'anvil-home')
    projectDir = join(tmpDir, 'my-project')
    await mkdir(anvilHome, { recursive: true })
    await mkdir(projectDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  // Helper: set ANVIL_HOME env so the CLI uses our tmp home
  function env(): NodeJS.ProcessEnv {
    return { ANVIL_HOME: anvilHome }
  }

  describe('anvil projects list', () => {
    it('prints "No projects tracked yet." on fresh install', () => {
      const output = runAnvil('projects list', { env: env(), cwd: projectDir })
      expect(output).toContain('No projects tracked yet')
    })

    it('shows project after writing a preference', async () => {
      await persistPreference(
        'review',
        { location: '.anvil/reviews/', format: 'json' },
        { cwd: projectDir, anvilHome },
      )
      const output = runAnvil('projects list', { env: env(), cwd: projectDir })
      expect(output).toContain('my-project')
    })

    it('--json emits valid JSON with version field', () => {
      const output = runAnvil('projects list --json', {
        env: env(),
        cwd: projectDir,
      })
      const parsed = JSON.parse(output)
      expect(parsed).toHaveProperty('version', 1)
      expect(parsed).toHaveProperty('projects')
    })

    it('--json after persisting shows the project entry', async () => {
      await persistPreference(
        'plan',
        { location: '.anvil/plans/', format: 'markdown' },
        { cwd: projectDir, anvilHome },
      )
      const output = runAnvil('projects list --json', {
        env: env(),
        cwd: projectDir,
      })
      const parsed = JSON.parse(output)
      const projects = parsed.projects as Record<string, unknown>
      const keys = Object.keys(projects)
      expect(keys).toHaveLength(1)
      expect(keys[0]).toBe('my-project')
    })
  })

  describe('anvil projects show', () => {
    it('prints "no preferences for this project yet" when no prefs', () => {
      const output = runAnvil('projects show', { env: env(), cwd: projectDir })
      expect(output.toLowerCase()).toContain('no preferences')
    })

    it('shows preferences after persisting', async () => {
      await persistPreference(
        'review',
        { location: '.anvil/reviews/', format: 'json' },
        { cwd: projectDir, anvilHome },
      )
      const output = runAnvil('projects show', { env: env(), cwd: projectDir })
      expect(output).toContain('my-project')
      expect(output).toContain('review')
    })

    it('--json emits valid JSON with project data', async () => {
      await persistPreference(
        'review',
        { location: '.anvil/reviews/', format: 'json' },
        { cwd: projectDir, anvilHome },
      )
      const output = runAnvil('projects show --json', {
        env: env(),
        cwd: projectDir,
      })
      const parsed = JSON.parse(output)
      expect(parsed).toHaveProperty('projectName')
      expect(parsed.projectName).toBe('my-project')
      expect(parsed).toHaveProperty('preferences')
    })

    it('--json emits null preferences when no prefs exist', () => {
      const output = runAnvil('projects show --json', {
        env: env(),
        cwd: projectDir,
      })
      const parsed = JSON.parse(output)
      expect(parsed).toHaveProperty('projectName')
      expect(parsed.preferences).toBeNull()
    })

    it('show with explicit cwd arg uses that path', async () => {
      const other = join(tmpDir, 'other-project')
      await mkdir(other, { recursive: true })
      await persistPreference(
        'review',
        { location: '.anvil/reviews/', format: 'json' },
        { cwd: other, anvilHome },
      )
      const output = runAnvil(`projects show ${other}`, {
        env: env(),
        cwd: projectDir,
      })
      expect(output).toContain('other-project')
    })
  })

  describe('anvil projects --help', () => {
    it('shows help for projects list', () => {
      const output = runAnvil('projects list --help', {
        env: env(),
        cwd: projectDir,
      })
      expect(output.toLowerCase()).toContain('usage')
    })

    it('shows help for projects show', () => {
      const output = runAnvil('projects show --help', {
        env: env(),
        cwd: projectDir,
      })
      expect(output.toLowerCase()).toContain('usage')
    })
  })
})
