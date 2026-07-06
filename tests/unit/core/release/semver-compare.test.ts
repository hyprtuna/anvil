import { describe, expect, it } from 'vitest'
import { bumpDown, compareSemver } from '../../../../src/core/release/semver.js'
import { SemverVersion } from '../../../../src/core/release/types.js'

describe('SemverVersion schema', () => {
  it('accepts a valid MAJOR.MINOR.PATCH string', () => {
    expect(SemverVersion.safeParse('1.2.3').success).toBe(true)
    expect(SemverVersion.safeParse('0.0.0').success).toBe(true)
    expect(SemverVersion.safeParse('10.20.30').success).toBe(true)
  })

  it('rejects strings with pre-release suffix', () => {
    expect(SemverVersion.safeParse('1.2.3-alpha').success).toBe(false)
    expect(SemverVersion.safeParse('1.2.3-rc.1').success).toBe(false)
  })

  it('rejects strings with build metadata', () => {
    expect(SemverVersion.safeParse('1.2.3+build.1').success).toBe(false)
  })

  it('rejects strings with too few or too many segments', () => {
    expect(SemverVersion.safeParse('1.2').success).toBe(false)
    expect(SemverVersion.safeParse('1.2.3.4').success).toBe(false)
    expect(SemverVersion.safeParse('1').success).toBe(false)
  })

  it('rejects non-numeric segments', () => {
    expect(SemverVersion.safeParse('a.b.c').success).toBe(false)
  })
})

describe('compareSemver', () => {
  it('returns 0 for identical versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0)
    expect(compareSemver('0.0.0', '0.0.0')).toBe(0)
  })

  it('returns -1 when a < b by major', () => {
    expect(compareSemver('0.9.9', '1.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
  })

  it('returns 1 when a > b by major', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1)
  })

  it('returns -1 when a < b by minor (same major)', () => {
    expect(compareSemver('1.2.9', '1.3.0')).toBe(-1)
    expect(compareSemver('0.13.3', '0.13.4')).toBe(-1)
  })

  it('returns 1 when a > b by minor (same major)', () => {
    expect(compareSemver('1.3.0', '1.2.9')).toBe(1)
  })

  it('returns -1 when a < b by patch (same major.minor)', () => {
    expect(compareSemver('1.2.2', '1.2.3')).toBe(-1)
    expect(compareSemver('0.13.3', '0.13.4')).toBe(-1)
  })

  it('returns 1 when a > b by patch (same major.minor)', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1)
  })

  it('handles large version numbers correctly', () => {
    expect(compareSemver('10.20.30', '10.20.29')).toBe(1)
    expect(compareSemver('10.20.29', '10.20.30')).toBe(-1)
  })
})

describe('bumpDown', () => {
  it('decrements the patch segment by 1', () => {
    expect(bumpDown('1.2.3')).toBe('1.2.2')
    expect(bumpDown('0.13.4')).toBe('0.13.3')
    expect(bumpDown('1.0.1')).toBe('1.0.0')
  })

  it('returns null when patch is already 0', () => {
    expect(bumpDown('1.2.0')).toBeNull()
    expect(bumpDown('0.0.0')).toBeNull()
    expect(bumpDown('0.13.0')).toBeNull()
  })

  it('does not modify major or minor when decrementing patch', () => {
    const result = bumpDown('2.5.3')
    expect(result).toBe('2.5.2')
  })
})
