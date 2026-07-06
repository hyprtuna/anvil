/**
 * ANV-0033 — Asserts that package.json "files" array contains "data/"
 * so the bundled snapshot ships in the published npm tarball.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const pkgPath = resolve(here, '../../../package.json')

describe('package.json files array', () => {
  it('includes "data/" so model-capabilities.json ships in the tarball', () => {
    const raw = readFileSync(pkgPath, 'utf-8')
    const pkg = JSON.parse(raw) as { files?: unknown[] }
    expect(Array.isArray(pkg.files)).toBe(true)
    expect(pkg.files).toContain('data/')
  })
})
