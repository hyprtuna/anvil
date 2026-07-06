import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectV1Residue } from '../../src/installer/residue.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('detectV1Residue', () => {
  it('flags a v1 anvil plugin.json', async () => {
    const dir = createTestTmpDir('res')
    mkdirSync(join(dir, '.claude-plugin'))
    writeFileSync(
      join(dir, '.claude-plugin/plugin.json'),
      JSON.stringify({ name: 'anvil' }),
    )
    try {
      const found = await detectV1Residue(dir, dir)
      expect(found.length).toBeGreaterThan(0)
      expect(found[0].reason).toMatch(/v1/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not flag a v2 anvil plugin.json', async () => {
    const dir = createTestTmpDir('res')
    mkdirSync(join(dir, '.claude-plugin'))
    writeFileSync(
      join(dir, '.claude-plugin/plugin.json'),
      JSON.stringify({ name: 'anvil', _anvilv2: true }),
    )
    try {
      const found = await detectV1Residue(dir, dir)
      expect(found).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('flags a v1 opencode.json with agents array', async () => {
    const dir = createTestTmpDir('res')
    mkdirSync(join(dir, '.opencode'))
    writeFileSync(
      join(dir, '.opencode/opencode.json'),
      JSON.stringify({ name: 'anvil', agents: [] }),
    )
    try {
      const found = await detectV1Residue(dir, dir)
      expect(found.length).toBeGreaterThan(0)
      expect(found[0].reason).toMatch(/v1/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('returns empty when no residue', async () => {
    const dir = createTestTmpDir('res')
    try {
      expect(await detectV1Residue(dir, dir)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('detects residue in cwd when home is clean', async () => {
    const home = createTestTmpDir('home')
    const cwd = createTestTmpDir('cwd')
    mkdirSync(join(cwd, '.claude-plugin'))
    writeFileSync(
      join(cwd, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'anvil' }),
    )
    try {
      const found = await detectV1Residue(home, cwd)
      expect(found).toHaveLength(1)
      expect(found[0].path).toContain(cwd)
    } finally {
      rmSync(home, { recursive: true, force: true })
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
