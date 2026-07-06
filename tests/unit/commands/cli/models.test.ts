import { rmSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  modelsListCommand,
  modelsSetCommand,
  modelsShowCommand,
  modelsUseCommand,
  modelsValidateCommand,
} from '../../../../src/commands/cli/models.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('commands/cli/models', () => {
  let tmp: string
  let origCwd: string
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    tmp = createTestTmpDir('anvil')
    origCwd = process.cwd()
    process.chdir(tmp)
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    process.chdir(origCwd)
    rmSync(tmp, { recursive: true, force: true })
    writeSpy.mockRestore()
  })

  it('lists models as JSON array with model and source fields', async () => {
    await modelsListCommand({ json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed).toBeInstanceOf(Array)
    expect(parsed[0]).toHaveProperty('model')
    expect(parsed[0]).toHaveProperty('source')
  })

  it('show traces resolution for a specific skill', async () => {
    await modelsShowCommand('planning', { json: true })
    const output = writeSpy.mock.calls.map((c) => c[0]).join('')
    const parsed = JSON.parse(output)
    expect(parsed.skill).toBe('planning')
    expect(parsed.trace).toBeInstanceOf(Array)
    expect(parsed.trace.length).toBe(9) // ANV-0213: 9 trace entries (cli, cli-tier, session, env, agent-override, tier, override, group, default)
  })

  it('use balanced writes the default config', async () => {
    await modelsUseCommand('balanced')
    const { loadConfig } = await import('../../../../src/core/config/load.js')
    const config = await loadConfig({ scope: 'project', cwd: tmp })
    // Defaults ship the short alias 'sonnet'; resolver expands at use-time.
    expect(config.defaults.model).toBe('sonnet')
  })

  it('set writes a per-skill override', async () => {
    await modelsSetCommand('planning', {
      model: 'claude-haiku-4-5',
      effort: 'low',
    })
    const { loadConfig } = await import('../../../../src/core/config/load.js')
    const config = await loadConfig({ scope: 'project', cwd: tmp })
    expect(config.overrides.planning?.model).toBe('claude-haiku-4-5')
  })

  it('validate passes on a fresh config', async () => {
    await modelsUseCommand('balanced')
    await expect(modelsValidateCommand()).resolves.not.toThrow()
  })
})
