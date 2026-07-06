import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { detectPackageManager } from '../../../../../src/core/project/detectors/package-manager.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

let tmp: string

beforeAll(() => {
  tmp = createTestTmpDir('pkgmgr')
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('core/project/detectors/package-manager', () => {
  it('returns undefined when no lockfile is present', () => {
    const dir = join(tmp, 'empty')
    mkdirSync(dir, { recursive: true })
    expect(detectPackageManager(dir)).toBeUndefined()
  })

  it('detects pnpm via pnpm-lock.yaml', () => {
    const dir = join(tmp, 'pnpm')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 6')
    const out = detectPackageManager(dir)
    expect(out?.name).toBe('pnpm')
    expect(out?.evidence).toContain('pnpm-lock.yaml')
  })

  it('prefers pnpm over npm when both lockfiles are present (priority order)', () => {
    const dir = join(tmp, 'mixed')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 6')
    expect(detectPackageManager(dir)?.name).toBe('pnpm')
  })

  it('detects bun via bun.lockb', () => {
    const dir = join(tmp, 'bun')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'bun.lockb'), '')
    expect(detectPackageManager(dir)?.name).toBe('bun')
  })

  it('detects cross-language managers (cargo, poetry)', () => {
    const cargoDir = join(tmp, 'cargo')
    mkdirSync(cargoDir, { recursive: true })
    writeFileSync(join(cargoDir, 'Cargo.lock'), '')
    expect(detectPackageManager(cargoDir)?.name).toBe('cargo')

    const poetryDir = join(tmp, 'poetry')
    mkdirSync(poetryDir, { recursive: true })
    writeFileSync(join(poetryDir, 'poetry.lock'), '')
    expect(detectPackageManager(poetryDir)?.name).toBe('poetry')
  })
})
