import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildPinnedSkillsRow } from '../../../../src/commands/cli/doctor.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('doctor — Pinned skills row', () => {
  let home: string

  beforeEach(() => {
    home = createTestTmpDir('doctor-pin')
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  it('passes with 0/5 when pins.json is absent', async () => {
    const row = await buildPinnedSkillsRow(home)
    expect(row.status).toBe('pass')
    expect(row.detail).toMatch(/0\/5/)
  })

  it('reports the live pin count', async () => {
    await mkdir(join(home, '.anvil'), { recursive: true })
    await writeFile(
      join(home, '.anvil', 'pins.json'),
      JSON.stringify({ pins: ['a', 'b'] }),
      'utf-8',
    )
    const row = await buildPinnedSkillsRow(home)
    expect(row.status).toBe('pass')
    expect(row.detail).toMatch(/2\/5/)
  })

  it('warns when over the cap', async () => {
    await mkdir(join(home, '.anvil'), { recursive: true })
    await writeFile(
      join(home, '.anvil', 'pins.json'),
      JSON.stringify({ pins: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      'utf-8',
    )
    const row = await buildPinnedSkillsRow(home)
    expect(row.status).toBe('warn')
    expect(row.detail).toMatch(/6\/5/)
  })

  it('warns when pins.json is malformed', async () => {
    await mkdir(join(home, '.anvil'), { recursive: true })
    await writeFile(
      join(home, '.anvil', 'pins.json'),
      JSON.stringify('not an object'),
      'utf-8',
    )
    const row = await buildPinnedSkillsRow(home)
    expect(row.status).toBe('warn')
    expect(row.detail).toMatch(/failed to parse/i)
  })
})
