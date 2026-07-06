import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { linkCli } from '../../src/installer/link-cli.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

describe('linkCli', () => {
  let tmpBase: string
  let fakeHome: string
  let anvilHome: string
  let originalHome: string | undefined

  beforeEach(() => {
    tmpBase = createTestTmpDir('link-cli')
    fakeHome = join(tmpBase, 'fake-home')
    anvilHome = join(tmpBase, 'anvil-home')
    mkdirSync(join(anvilHome, 'bin'), { recursive: true })
    writeFileSync(join(anvilHome, 'bin', 'anvil.cjs'), '#!/usr/bin/env node\n')
    mkdirSync(fakeHome, { recursive: true })
    originalHome = process.env.HOME
    process.env.HOME = fakeHome
  })

  afterEach(() => {
    process.env.HOME = originalHome
    rmSync(tmpBase, { recursive: true, force: true })
  })

  it('creates ~/.local/bin/anvil → anvilHome/bin/anvil.cjs', async () => {
    const res = await linkCli({ anvilHome })

    const linkPath = join(fakeHome, '.local', 'bin', 'anvil')
    expect(res.linkPath).toBe(linkPath)
    expect(res.target).toBe(join(anvilHome, 'bin', 'anvil.cjs'))
    expect(res.created).toBe(true)

    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(linkPath)).toBe(join(anvilHome, 'bin', 'anvil.cjs'))
  })

  it('replaces a stale symlink idempotently', async () => {
    await linkCli({ anvilHome })
    await linkCli({ anvilHome }) // second call must not throw

    const linkPath = join(fakeHome, '.local', 'bin', 'anvil')
    expect(existsSync(linkPath)).toBe(true)
    expect(readlinkSync(linkPath)).toBe(join(anvilHome, 'bin', 'anvil.cjs'))
  })
})
