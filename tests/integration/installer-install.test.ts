import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runInstaller } from '../../src/installer/install.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function makeTmp(): string {
  const tmp = createTestTmpDir('install')
  return tmp
}

describe('runInstaller', () => {
  it('installs claude-code target — creates expected files', async () => {
    const tmp = makeTmp()
    const result = await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    expect(result.dryRun).toBe(false)
    expect(result.filesWritten.length).toBeGreaterThan(0)
    expect(existsSync(join(tmp, '.claude-plugin', 'plugin.json'))).toBe(true)
    // models.json is now at project root (Plan 17)
    expect(existsSync(join(tmp, 'models.json'))).toBe(true)
    // saveConfig writes .anvil/models.json
    expect(existsSync(join(tmp, '.anvil', 'models.json'))).toBe(true)
  })

  it('installs both targets — creates claude-code and opencode files', async () => {
    const tmp = makeTmp()
    const result = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    expect(result.adapters).toHaveLength(2)
    expect(existsSync(join(tmp, '.claude-plugin', 'plugin.json'))).toBe(true)
    expect(existsSync(join(tmp, 'plugins', 'opencode', 'package.json'))).toBe(
      true,
    )
  })

  it('dry-run writes nothing but returns filesWritten list', async () => {
    const tmp = makeTmp()
    const result = await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
      dryRun: true,
    })
    expect(result.dryRun).toBe(true)
    expect(result.filesWritten.length).toBeGreaterThan(0)
    // Nothing should actually be written
    expect(existsSync(join(tmp, '.claude-plugin'))).toBe(false)
    expect(existsSync(join(tmp, '.anvil'))).toBe(false)
  })

  it('is idempotent — second install produces same plugin.json content', async () => {
    const tmp = makeTmp()
    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    const { readFileSync } = await import('node:fs')
    const content1 = readFileSync(
      join(tmp, '.claude-plugin', 'plugin.json'),
      'utf-8',
    )

    await runInstaller({
      target: 'claude-code',
      scope: 'project',
      preset: 'balanced',
      cwd: tmp,
    })
    const content2 = readFileSync(
      join(tmp, '.claude-plugin', 'plugin.json'),
      'utf-8',
    )

    expect(content1).toBe(content2)
  })

  it('returns adapter names and file counts', async () => {
    const tmp = makeTmp()
    const result = await runInstaller({
      target: 'both',
      scope: 'project',
      preset: 'cost-optimised',
      cwd: tmp,
    })
    const names = result.adapters.map((a) => a.name)
    expect(names).toContain('claude-code')
    expect(names).toContain('opencode')
    for (const adapter of result.adapters) {
      expect(adapter.count).toBeGreaterThan(0)
    }
  })
})
