/**
 * Plan 33 Phase E6 — Doctor drift detection tests.
 *
 * When settings.json points at a non-anvil statusLine command,
 * doctor should surface a warn row with a migration hint.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  classifyStatuslineCommandForTest,
  inspectStatuslineWiringForTest,
} from '../../src/commands/cli/doctor.js'

let tmpHome: string
let tmpProject: string

beforeEach(async () => {
  const ts = Date.now()
  tmpHome = join(tmpdir(), `anvil-drift-home-${ts}`)
  tmpProject = join(tmpdir(), `anvil-drift-proj-${ts}`)
  await mkdir(join(tmpHome, '.claude'), { recursive: true })
  await mkdir(join(tmpProject, '.claude'), { recursive: true })
  vi.stubEnv('HOME', tmpHome)
})

afterEach(async () => {
  await rm(tmpHome, { recursive: true, force: true })
  await rm(tmpProject, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('statusline drift classification', () => {
  it('classifies "anvil statusline" command as anvil', () => {
    const settings = {
      statusLine: {
        type: 'command',
        command: '/home/user/.anvil/bin/anvil.cjs statusline',
      },
    }
    const result = classifyStatuslineCommandForTest(settings)
    expect(result.kind).toBe('anvil')
  })

  it('classifies bash statusline-command.sh as anvil-shell', () => {
    const settings = {
      statusLine: {
        type: 'command',
        command: 'bash /home/user/.claude/statusline-command.sh',
      },
    }
    const result = classifyStatuslineCommandForTest(settings)
    expect(result.kind).toBe('anvil-shell')
  })

  it('classifies custom bash script as custom', () => {
    const settings = {
      statusLine: {
        type: 'command',
        command: 'bash ~/my-custom-statusline.sh',
      },
    }
    const result = classifyStatuslineCommandForTest(settings)
    expect(result.kind).toBe('custom')
  })

  it('returns missing when statusLine is absent', () => {
    const settings = {}
    const result = classifyStatuslineCommandForTest(settings)
    expect(result.kind).toBe('missing')
  })
})

describe('inspectStatuslineWiring — project scope', () => {
  it('returns warn when project settings has custom non-anvil command', async () => {
    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const settings = {
      statusLine: { type: 'command', command: 'bash ~/custom.sh' },
    }
    await writeFile(settingsPath, JSON.stringify(settings), 'utf-8')

    const projectSettings = JSON.parse(
      await import('node:fs/promises').then((fs) =>
        fs.readFile(settingsPath, 'utf-8'),
      ),
    ) as unknown
    const result = inspectStatuslineWiringForTest(projectSettings)
    expect(result.status).toBe('warn')
    expect(result.detail).toMatch(/Custom statusline/i)
    expect(result.detail).toMatch(/anvil statusline install/i)
  })

  it('returns pass when project settings has anvil command', async () => {
    const settingsPath = join(tmpProject, '.claude', 'settings.json')
    const settings = {
      statusLine: {
        type: 'command',
        command: '/home/user/.anvil/bin/anvil.cjs statusline',
      },
    }
    await writeFile(settingsPath, JSON.stringify(settings), 'utf-8')

    const projectSettings = JSON.parse(
      await import('node:fs/promises').then((fs) =>
        fs.readFile(settingsPath, 'utf-8'),
      ),
    ) as unknown
    const result = inspectStatuslineWiringForTest(projectSettings)
    expect(result.status).toBe('pass')
  })

  it('returns warn when settings.json has no statusLine block', () => {
    const result = inspectStatuslineWiringForTest({})
    expect(result.status).toBe('warn')
    // Message updated in Plan 33 E4 to reference `anvil statusline install`
    expect(result.detail).toMatch(/not wired/i)
    expect(result.detail).toMatch(/anvil statusline install/i)
  })
})
