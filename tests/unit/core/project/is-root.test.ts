import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { isProjectRoot } from '../../../../src/core/project/is-root.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('isProjectRoot', () => {
  let tmp: string

  beforeEach(() => {
    tmp = createTestTmpDir('is-root')
  })

  it('returns false for an empty directory', () => {
    expect(isProjectRoot(tmp)).toBe(false)
  })

  it('returns true when package.json is present', () => {
    writeFileSync(join(tmp, 'package.json'), '{}')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when .git directory is present', () => {
    mkdirSync(join(tmp, '.git'))
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when pyproject.toml is present', () => {
    writeFileSync(join(tmp, 'pyproject.toml'), '')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when Cargo.toml is present', () => {
    writeFileSync(join(tmp, 'Cargo.toml'), '')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when go.mod is present', () => {
    writeFileSync(join(tmp, 'go.mod'), '')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when pom.xml is present', () => {
    writeFileSync(join(tmp, 'pom.xml'), '')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when Gemfile is present', () => {
    writeFileSync(join(tmp, 'Gemfile'), '')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns true when composer.json is present', () => {
    writeFileSync(join(tmp, 'composer.json'), '')
    expect(isProjectRoot(tmp)).toBe(true)
  })

  it('returns false for a directory with an unrelated file', () => {
    writeFileSync(join(tmp, 'some-unrelated-file.txt'), 'hello')
    expect(isProjectRoot(tmp)).toBe(false)
  })
})
