import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPreset } from '../../../src/core/config/presets.js'
import { runUpgrade } from '../../../src/installer/upgrade.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

describe('installer/upgrade', () => {
  let tmp: string

  beforeEach(async () => {
    tmp = createTestTmpDir('upgrade')
  })
  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it('preserves the existing .anvil/models.json instead of rebuilding from balanced preset', async () => {
    // Seed with the max-quality preset, then upgrade — the models.json must stay max-quality.
    const maxQuality = buildPreset('max-quality')
    await mkdir(join(tmp, '.anvil'), { recursive: true })
    await writeFile(
      join(tmp, '.anvil', 'models.json'),
      `${JSON.stringify(maxQuality, null, 2)}\n`,
      'utf-8',
    )

    await runUpgrade({ cwd: tmp })

    expect(existsSync(join(tmp, '.anvil', 'models.json'))).toBe(true)
    const after = JSON.parse(
      await readFile(join(tmp, '.anvil', 'models.json'), 'utf-8'),
    )
    expect(after.defaults.model).toBe(maxQuality.defaults.model)
    expect(after.defaults.effort).toBe(maxQuality.defaults.effort)
  })
})
