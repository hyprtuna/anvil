import type { SemverVersion } from './types.js'

/**
 * Generate the source for a "positive assertion" test file.
 *
 * This file runs against the new version (`v`) and verifies that
 * both package.json and marketplace.json are stamped with it.
 *
 * @param v    - new (target) version
 * @param prev - old (previous) version
 */
export function emitPositiveAssertionTest(
  v: SemverVersion,
  prev: SemverVersion,
): string {
  return `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_JSON_PATH = join(process.cwd(), 'package.json')
const MARKETPLACE_JSON_PATH = join(process.cwd(), 'marketplace.json')

describe('version bump — v${v}', () => {
  it('package.json version is ${v}', () => {
    const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8')
    const pkg = JSON.parse(raw) as { version: string }
    expect(pkg.version).toBe('${v}')
  })

  it('marketplace.json version is ${v}', () => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8')
    const mkt = JSON.parse(raw) as { version: string }
    expect(mkt.version).toBe('${v}')
  })

  it('package.json version is not stale ${prev}', () => {
    const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8')
    const pkg = JSON.parse(raw) as { version: string }
    expect(pkg.version).not.toBe('${prev}')
  })

  it('marketplace.json version is not stale ${prev}', () => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8')
    const mkt = JSON.parse(raw) as { version: string }
    expect(mkt.version).not.toBe('${prev}')
  })

  it('package.json and marketplace.json versions are in sync', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      version: string
    }
    const mkt = JSON.parse(readFileSync(MARKETPLACE_JSON_PATH, 'utf8')) as {
      version: string
    }
    expect(pkg.version).toBe(mkt.version)
  })
})
`
}

/**
 * Generate the source for a "historical anti-stale" test file.
 *
 * After the version is bumped to `v`, the old test file for `prev` is
 * converted to only assert what will remain permanently true:
 * that neither file still holds the old version.
 *
 * @param v    - new (target) version
 * @param prev - old (previous) version
 */
export function emitHistoricalAntiStaleTest(
  _v: SemverVersion,
  prev: SemverVersion,
): string {
  return `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_JSON_PATH = join(process.cwd(), 'package.json')
const MARKETPLACE_JSON_PATH = join(process.cwd(), 'marketplace.json')

describe('version bump — v${prev} (historical — not stale checks)', () => {
  it('package.json version is not stale ${prev}', () => {
    const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8')
    const pkg = JSON.parse(raw) as { version: string }
    expect(pkg.version).not.toBe('${prev}')
  })

  it('marketplace.json version is not stale ${prev}', () => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8')
    const mkt = JSON.parse(raw) as { version: string }
    expect(mkt.version).not.toBe('${prev}')
  })
})
`
}
