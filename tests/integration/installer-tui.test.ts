import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runInstaller } from '../../src/installer/install.js'
import { runUninstall } from '../../src/installer/uninstall.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('integration: installer full cycle', () => {
  it('install → uninstall round-trip', async () => {
    const tmp = createTestTmpDir('roundtrip')
    const installResult = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'max-quality',
      cwd: tmp,
    })
    expect(installResult.filesWritten.length).toBeGreaterThan(0)
    expect(existsSync(join(tmp, '.anvil', 'models.json'))).toBe(true)
    expect(existsSync(join(tmp, '.claude-plugin', 'plugin.json'))).toBe(true)
    expect(existsSync(join(tmp, 'plugins', 'opencode', 'package.json'))).toBe(
      true,
    )
    const uninstallResult = await runUninstall({ scope: 'project', cwd: tmp })
    expect(uninstallResult.removed.length).toBeGreaterThan(0)
    expect(existsSync(join(tmp, '.anvil'))).toBe(false)
    expect(existsSync(join(tmp, '.claude-plugin'))).toBe(false)
    expect(existsSync(join(tmp, '.opencode'))).toBe(false)
    rmSync(tmp, { recursive: true })
  })
})
