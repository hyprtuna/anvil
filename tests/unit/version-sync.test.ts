import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('version sync', () => {
  it('package.json and marketplace.json versions match', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'))
    const mkt = JSON.parse(readFileSync('marketplace.json', 'utf-8'))
    expect(pkg.version).toBe(mkt.version)
  })
})
