import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { resolvePaths } from '../../../../src/core/config/paths.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('core/config/paths', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('test')
  })

  it('resolves project scope paths', () => {
    const paths = resolvePaths({ scope: 'project', cwd: tmp })
    expect(paths.anvil).toBe(join(tmp, '.anvil'))
    expect(paths.claude).toBe(join(tmp, '.claude'))
    expect(paths.opencode).toBe(join(tmp, '.opencode'))
  })

  it('resolves global scope paths', () => {
    const home = tmp
    const paths = resolvePaths({ scope: 'global', cwd: tmp, home })
    expect(paths.anvil).toBe(join(home, '.anvil'))
    expect(paths.claude).toBe(join(home, '.claude'))
    expect(paths.opencode).toBe(join(home, '.opencode'))
  })

  it('detects an existing .anvil/ directory', () => {
    mkdirSync(join(tmp, '.anvil'))
    writeFileSync(join(tmp, '.anvil', 'models.json'), '{}')
    const paths = resolvePaths({ scope: 'project', cwd: tmp })
    expect(paths.hasAnvilDir).toBe(true)
  })
})
