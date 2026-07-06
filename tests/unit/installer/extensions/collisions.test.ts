/**
 * ANV-0027 — Three-tier collision detector tests.
 */

import { describe, expect, it } from 'vitest'
import { detectCollisions } from '../../../../src/installer/extensions/index.js'
import type {
  CollisionContext,
  ExtensionManifest,
} from '../../../../src/installer/extensions/index.js'

function emptyBundled(): CollisionContext['bundled'] {
  return {
    skill: new Set<string>(),
    agent: new Set<string>(),
    hook: new Set<string>(),
    command: new Set<string>(),
  }
}

const base: ExtensionManifest = {
  schema_version: '1.0.0',
  name: 'pack-a',
  version: '0.1.0',
  description: 'd',
  kind: 'extension',
  provides: {},
  requires: [],
  compatibility: { min_anvil_version: '0.15.6' },
}

describe('detectCollisions', () => {
  it('returns no collisions when manifest is clean', () => {
    const ctx: CollisionContext = {
      bundled: emptyBundled(),
      installed: [],
    }
    expect(detectCollisions(base, ctx)).toEqual([])
  })

  it('reports a tier-1 collision when installed extension shares the name', () => {
    const ctx: CollisionContext = {
      bundled: emptyBundled(),
      installed: [{ name: 'pack-a', provides: { skill: ['unrelated'] } }],
    }
    const collisions = detectCollisions(base, ctx)
    const tier1 = collisions.filter((c) => c.tier === 1)
    expect(tier1).toHaveLength(1)
    expect(tier1[0]?.kind).toBe('extension')
    expect(tier1[0]?.slug).toBe('pack-a')
  })

  it('reports a tier-2 collision when provides shadows a bundled core slug', () => {
    const ctx: CollisionContext = {
      bundled: {
        ...emptyBundled(),
        skill: new Set(['code-review']),
      },
      installed: [],
    }
    const manifest = { ...base, provides: { skill: ['code-review'] } }
    const collisions = detectCollisions(manifest, ctx)
    expect(collisions).toHaveLength(1)
    expect(collisions[0]?.tier).toBe(2)
    expect(collisions[0]?.kind).toBe('skill')
    expect(collisions[0]?.slug).toBe('code-review')
  })

  it('reports a tier-3 collision when another extension provides the same slug', () => {
    const ctx: CollisionContext = {
      bundled: emptyBundled(),
      installed: [{ name: 'pack-b', provides: { hook: ['session-start'] } }],
    }
    const manifest = { ...base, provides: { hook: ['session-start'] } }
    const collisions = detectCollisions(manifest, ctx)
    const tier3 = collisions.filter((c) => c.tier === 3)
    expect(tier3).toHaveLength(1)
    expect(tier3[0]?.kind).toBe('hook')
    expect(tier3[0]?.slug).toBe('session-start')
    expect(tier3[0]?.conflictingSource).toContain('pack-b')
  })

  it('reports multiple collisions across tiers in one pass', () => {
    const ctx: CollisionContext = {
      bundled: {
        ...emptyBundled(),
        agent: new Set(['code-architect']),
      },
      installed: [
        { name: 'pack-a', provides: { skill: ['my-skill'] } },
        { name: 'pack-other', provides: { skill: ['my-skill'] } },
      ],
    }
    const manifest: ExtensionManifest = {
      ...base,
      provides: {
        skill: ['my-skill'],
        agent: ['code-architect'],
      },
    }
    const collisions = detectCollisions(manifest, ctx)
    expect(collisions.some((c) => c.tier === 1)).toBe(true)
    expect(
      collisions.some((c) => c.tier === 2 && c.slug === 'code-architect'),
    ).toBe(true)
    const tier3 = collisions.filter((c) => c.tier === 3)
    expect(tier3.length).toBeGreaterThanOrEqual(2)
  })

  it('does not produce false positives for unrelated kinds', () => {
    const ctx: CollisionContext = {
      bundled: { ...emptyBundled(), skill: new Set(['foo']) },
      installed: [{ name: 'pack-x', provides: { agent: ['foo'] } }],
    }
    const manifest = { ...base, provides: { hook: ['foo'] } }
    expect(detectCollisions(manifest, ctx)).toEqual([])
  })
})
