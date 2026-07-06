import { describe, expect, it } from 'vitest'
import {
  emitHistoricalAntiStaleTest,
  emitPositiveAssertionTest,
} from '../../../../../src/core/release/emit-version-bump-tests.js'

describe('emitPositiveAssertionTest', () => {
  it('contains a positive assertion for the new version', () => {
    const src = emitPositiveAssertionTest('0.13.4', '0.13.3')
    expect(src).toContain("expect(pkg.version).toBe('0.13.4')")
    expect(src).toContain("expect(mkt.version).toBe('0.13.4')")
  })

  it('contains a not-stale assertion for the old version', () => {
    const src = emitPositiveAssertionTest('0.13.4', '0.13.3')
    expect(src).toContain("expect(pkg.version).not.toBe('0.13.3')")
    expect(src).toContain("expect(mkt.version).not.toBe('0.13.3')")
  })

  it('contains a sync assertion between package.json and marketplace.json', () => {
    const src = emitPositiveAssertionTest('0.13.4', '0.13.3')
    expect(src).toContain('expect(pkg.version).toBe(mkt.version)')
  })

  it('has a describe block named for the new version', () => {
    const src = emitPositiveAssertionTest('2.0.0', '1.9.9')
    expect(src).toContain("describe('version bump — v2.0.0'")
  })

  it('does not assert equality to the previous version', () => {
    // The positive assertion should only assert the NEW version directly,
    // not accidentally assert equality to the old one.
    const src = emitPositiveAssertionTest('0.13.4', '0.13.3')
    // .not.toBe is OK; .toBe('0.13.3') is NOT OK
    const lines = src.split('\n')
    const positiveOldVersionAssertions = lines.filter(
      (l) => l.includes(".toBe('0.13.3')") && !l.includes('.not.'),
    )
    expect(positiveOldVersionAssertions).toHaveLength(0)
  })
})

describe('emitHistoricalAntiStaleTest', () => {
  it('only contains not-stale assertions (no positive .toBe for the old version)', () => {
    const src = emitHistoricalAntiStaleTest('0.13.4', '0.13.3')
    // Should have .not.toBe for old version
    expect(src).toContain("expect(pkg.version).not.toBe('0.13.3')")
    expect(src).toContain("expect(mkt.version).not.toBe('0.13.3')")
  })

  it('does NOT contain a positive assertion for the old version', () => {
    const src = emitHistoricalAntiStaleTest('0.13.4', '0.13.3')
    const lines = src.split('\n')
    // No line should assert pkg.version === '0.13.3' directly
    const positiveOldAssertions = lines.filter(
      (l) => l.includes(".toBe('0.13.3')") && !l.includes('.not.'),
    )
    expect(positiveOldAssertions).toHaveLength(0)
  })

  it('has a describe block marked as historical', () => {
    const src = emitHistoricalAntiStaleTest('0.13.4', '0.13.3')
    expect(src).toContain('historical')
    expect(src).toContain('v0.13.3')
  })

  it('does not contain an in-sync assertion (those break once next bump happens)', () => {
    const src = emitHistoricalAntiStaleTest('0.13.4', '0.13.3')
    expect(src).not.toContain('toBe(mkt.version)')
  })
})
