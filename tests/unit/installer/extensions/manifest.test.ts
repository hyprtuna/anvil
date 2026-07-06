/**
 * ANV-0027 — Manifest schema tests.
 */

import { describe, expect, it } from 'vitest'
import { parseManifest } from '../../../../src/installer/extensions/index.js'

const validManifest = {
  schema_version: '1.0.0',
  name: 'team-pack',
  version: '0.1.0',
  description: 'A test extension',
  kind: 'extension' as const,
  provides: {
    skill: ['my-skill'],
    agent: ['my-helper'],
  },
  requires: ['anvil:skill/code-review'],
  compatibility: {
    min_anvil_version: '0.15.6',
  },
}

describe('parseManifest', () => {
  it('accepts a fully valid manifest', () => {
    const r = parseManifest(validManifest)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.name).toBe('team-pack')
      expect(r.value.provides.skill).toEqual(['my-skill'])
      expect(r.value.requires).toEqual(['anvil:skill/code-review'])
    }
  })

  it('defaults provides and requires when omitted', () => {
    const minimal = {
      schema_version: '1.0.0',
      name: 'a',
      version: '0.0.1',
      description: 'minimal',
      kind: 'preset',
      compatibility: { min_anvil_version: '0.15.6' },
    }
    const r = parseManifest(minimal)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.requires).toEqual([])
      expect(r.value.provides).toEqual({})
    }
  })

  it('rejects missing schema_version', () => {
    const { schema_version: _unused, ...withoutVersion } = validManifest
    const r = parseManifest(withoutVersion)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('INVALID_MANIFEST')
      expect(r.error.issues.some((i) => i.path === 'schema_version')).toBe(true)
    }
  })

  it('rejects a malformed slug', () => {
    const r = parseManifest({ ...validManifest, name: 'Bad_Name' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.issues.some((i) => i.path === 'name')).toBe(true)
    }
  })

  it('rejects a requires[] entry without the anvil: prefix', () => {
    const r = parseManifest({
      ...validManifest,
      requires: ['not-a-uri'],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.issues.some((i) => i.path.startsWith('requires'))).toBe(
        true,
      )
    }
  })

  it('rejects an empty anvil: URI body', () => {
    const r = parseManifest({ ...validManifest, requires: ['anvil:   '] })
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown kind enum value', () => {
    const r = parseManifest({ ...validManifest, kind: 'gadget' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.issues.some((i) => i.path === 'kind')).toBe(true)
    }
  })

  it('rejects a non-semver version', () => {
    const r = parseManifest({ ...validManifest, version: 'one-point-oh' })
    expect(r.ok).toBe(false)
  })

  it('accepts all three kind enum values', () => {
    for (const kind of ['extension', 'preset', 'profile'] as const) {
      const r = parseManifest({ ...validManifest, kind })
      expect(r.ok).toBe(true)
    }
  })

  it('accepts a max_anvil_version when provided', () => {
    const r = parseManifest({
      ...validManifest,
      compatibility: {
        min_anvil_version: '0.15.6',
        max_anvil_version: '1.0.0',
      },
    })
    expect(r.ok).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(parseManifest(null).ok).toBe(false)
    expect(parseManifest('string').ok).toBe(false)
    expect(parseManifest(42).ok).toBe(false)
  })
})
