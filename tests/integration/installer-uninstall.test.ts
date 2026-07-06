import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runInstaller } from '../../src/installer/install.js'
import { runUninstall } from '../../src/installer/uninstall.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function makeTmp(): string {
  const tmp = createTestTmpDir('uninstall')
  return tmp
}

describe('runUninstall', () => {
  it('install then uninstall removes all installed dirs', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })

    // Verify things exist before uninstall
    expect(existsSync(join(tmp, '.claude-plugin'))).toBe(true)
    expect(existsSync(join(tmp, 'plugins', 'opencode', 'package.json'))).toBe(
      true,
    )
    expect(existsSync(join(tmp, '.anvil'))).toBe(true)

    const result = await runUninstall({ scope: 'project', cwd: tmp })
    expect(result.removed.length).toBeGreaterThan(0)

    expect(existsSync(join(tmp, '.anvil'))).toBe(false)
    expect(existsSync(join(tmp, '.claude-plugin'))).toBe(false)
  })

  it('uninstall on clean dir returns empty removed list', async () => {
    const tmp = makeTmp()
    const result = await runUninstall({ scope: 'project', cwd: tmp })
    expect(result.removed).toHaveLength(0)
  })

  it('uninstall is idempotent — second call returns empty removed', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    const first = await runUninstall({ scope: 'project', cwd: tmp })
    expect(first.removed.length).toBeGreaterThan(0)

    const second = await runUninstall({ scope: 'project', cwd: tmp })
    expect(second.removed).toHaveLength(0)
  })
})
