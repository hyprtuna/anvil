import { describe, expect, it } from 'vitest'
import {
  getPackageMeta,
  getPackageName,
  getPackageVersion,
} from '../../../src/core/package-meta.js'

describe('core/package-meta', () => {
  it('getPackageVersion returns a semver-shaped string', () => {
    const version = getPackageVersion()
    expect(version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('getPackageName is anvil', () => {
    expect(getPackageName()).toBe('anvil')
  })

  it('getPackageMeta caches repeated lookups', () => {
    const a = getPackageMeta()
    const b = getPackageMeta()
    expect(a).toBe(b)
  })
})
