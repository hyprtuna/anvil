import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../../../src/core/config/defaults.js'
import { loadConfig, saveConfig } from '../../../../src/core/config/load.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('core/config/load', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('test')
  })

  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig({ scope: 'project', cwd: tmp })
    expect(config.defaults.model).toBe('sonnet')
  })

  it('loads and merges an existing config', async () => {
    mkdirSync(join(tmp, '.anvil'))
    const override = {
      version: '1.0',
      defaults: {
        model: 'claude-opus-4-6',
        effort: 'max',
        max_tokens: 16384,
      },
    }
    writeFileSync(join(tmp, '.anvil', 'models.json'), JSON.stringify(override))
    const config = await loadConfig({ scope: 'project', cwd: tmp })
    expect(config.defaults.model).toBe('claude-opus-4-6')
    expect(config.defaults.max_tokens).toBe(16384)
    expect(config.groups.planning).toBeDefined()
  })

  it('saves a config to disk', async () => {
    const config = buildDefaultConfig()
    await saveConfig(config, { scope: 'project', cwd: tmp })
    const config2 = await loadConfig({ scope: 'project', cwd: tmp })
    expect(config2.defaults.model).toBe(config.defaults.model)
  })

  it('throws on malformed config', async () => {
    mkdirSync(join(tmp, '.anvil'))
    writeFileSync(join(tmp, '.anvil', 'models.json'), '{ invalid json')
    await expect(loadConfig({ scope: 'project', cwd: tmp })).rejects.toThrow()
  })

  it('rejects config that fails Zod validation', async () => {
    mkdirSync(join(tmp, '.anvil'))
    writeFileSync(
      join(tmp, '.anvil', 'models.json'),
      JSON.stringify({
        version: '1.0',
        defaults: { model: '', effort: 'wat', max_tokens: -1 },
        groups: {},
      }),
    )
    await expect(loadConfig({ scope: 'project', cwd: tmp })).rejects.toThrow()
  })
})
