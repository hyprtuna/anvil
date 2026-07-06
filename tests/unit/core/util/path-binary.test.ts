import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isBinaryOnPath } from '../../../../src/core/util/path-binary.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = createTestTmpDir('path-binary')
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true })
  vi.unstubAllEnvs()
})

describe('isBinaryOnPath', () => {
  it('returns true when binary exists in a PATH directory', () => {
    const binPath = join(tmpDir, 'my-binary')
    writeFileSync(binPath, '#!/bin/sh\n')
    vi.stubEnv('PATH', tmpDir)
    expect(isBinaryOnPath('my-binary')).toBe(true)
  })

  it('returns false when binary is not on PATH', () => {
    // Use the tmp dir as PATH but do not create the binary
    vi.stubEnv('PATH', tmpDir)
    expect(isBinaryOnPath('nonexistent-binary-xyz')).toBe(false)
  })

  it('returns false when PATH is empty', () => {
    vi.stubEnv('PATH', '')
    expect(isBinaryOnPath('opencode')).toBe(false)
  })

  it('returns false when name is empty', () => {
    vi.stubEnv('PATH', tmpDir)
    expect(isBinaryOnPath('')).toBe(false)
  })

  it('returns false when name contains a slash (absolute path)', () => {
    vi.stubEnv('PATH', tmpDir)
    expect(isBinaryOnPath('/usr/bin/opencode')).toBe(false)
  })
})
