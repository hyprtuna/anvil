import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkVersionSync,
  readChangelogTopVersion,
} from '../../../src/core/release/version-sync.js'

const ROOT = join(import.meta.dirname, '..', '..', '..')

describe('changelog-version-sync (half-ship guard)', () => {
  it('package.json, marketplace.json, and CHANGELOG.md top entry all agree', () => {
    const result = checkVersionSync(ROOT)
    expect(result.inSync, result.mismatches.join('; ')).toBe(true)
  })

  it('CHANGELOG.md has a versioned heading', () => {
    const version = readChangelogTopVersion(join(ROOT, 'CHANGELOG.md'))
    expect(version).not.toBeNull()
    expect(version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('package.json and marketplace.json versions are in sync', () => {
    const result = checkVersionSync(ROOT)
    expect(result.packageVersion).toBe(result.marketplaceVersion)
  })
})
