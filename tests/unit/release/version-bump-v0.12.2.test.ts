import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_JSON_PATH = join(process.cwd(), 'package.json')
const MARKETPLACE_JSON_PATH = join(process.cwd(), 'marketplace.json')

describe('version bump — v0.12.2 (historical — not stale checks)', () => {
  it('package.json version is not stale 0.12.1', () => {
    const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8')
    const pkg = JSON.parse(raw) as { version: string }
    expect(pkg.version).not.toBe('0.12.1')
  })

  it('marketplace.json version is not stale 0.12.1', () => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8')
    const mkt = JSON.parse(raw) as { version: string }
    expect(mkt.version).not.toBe('0.12.1')
  })

  it('package.json version is not stale 0.12.2', () => {
    const raw = readFileSync(PACKAGE_JSON_PATH, 'utf8')
    const pkg = JSON.parse(raw) as { version: string }
    expect(pkg.version).not.toBe('0.12.2')
  })

  it('marketplace.json version is not stale 0.12.2', () => {
    const raw = readFileSync(MARKETPLACE_JSON_PATH, 'utf8')
    const mkt = JSON.parse(raw) as { version: string }
    expect(mkt.version).not.toBe('0.12.2')
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
