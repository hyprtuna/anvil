import { existsSync, readdirSync, readlinkSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { syncAnvilHome } from '../../src/installer/sync.js'
import { buildFixtureContext } from '../helpers/fixtures.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('syncAnvilHome', () => {
  const stages: string[] = []
  afterEach(() => {
    for (const p of stages) rmSync(p, { recursive: true, force: true })
    stages.length = 0
  })

  it('populates an empty target directory atomically', async () => {
    const target = createTestTmpDir('target')
    rmSync(target, { recursive: true, force: true })
    stages.push(target)
    const res = await syncAnvilHome({ ctx: buildFixtureContext({}), target })
    expect(existsSync(join(target, 'version'))).toBe(true)
    expect(existsSync(join(target, '.claude-plugin/marketplace.json'))).toBe(
      true,
    )
    expect(
      existsSync(
        join(target, 'plugins/claude-code/.claude-plugin/plugin.json'),
      ),
    ).toBe(true)
    expect(existsSync(join(target, 'plugins/opencode/package.json'))).toBe(true)
    expect(readlinkSync(join(target, 'plugins/claude-code/skills'))).toBe(
      '../../skills',
    )
    expect(res.staged).toBeGreaterThan(0)
  })

  it('replaces an existing payload atomically (no .old dir remains)', async () => {
    const target = createTestTmpDir('target')
    stages.push(target)
    await syncAnvilHome({ ctx: buildFixtureContext({}), target })
    await syncAnvilHome({ ctx: buildFixtureContext({}), target })
    expect(existsSync(target)).toBe(true)
    const parentEntries = readdirSync(join(target, '..'))
    expect(parentEntries.some((x: string) => x.includes('.old-'))).toBe(false)
  })
})
