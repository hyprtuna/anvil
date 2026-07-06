/**
 * ANV-0096 — resolvePackSlug unit tests.
 *
 * Uses tmp-dir-backed fake project / home / bundled / packs roots to verify
 * precedence and collision semantics without relying on the real filesystem.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  BUNDLED_PACK,
  resolvePackSlug,
} from '../../../../src/core/pack/resolve.js'
import type {
  PackResolveContext,
  PackResolveRoots,
} from '../../../../src/core/pack/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

interface Fixture {
  tmp: string
  roots: PackResolveRoots
  cleanup: () => void
}

function makeFixture(): Fixture {
  const tmp = createTestTmpDir('pack-resolve')
  const projectRoot = join(tmp, 'proj')
  const homeRoot = join(tmp, 'home')
  const bundledRoot = join(tmp, 'bundled')
  const packsRoot = join(tmp, 'packs')
  for (const p of [projectRoot, homeRoot, bundledRoot, packsRoot]) {
    mkdirSync(p, { recursive: true })
  }
  return {
    tmp,
    roots: { projectRoot, homeRoot, bundledRoot, packsRoot },
    cleanup: () => {
      // tmpdir helper handles teardown for us if it tracks; otherwise tests
      // rely on per-OS tmp cleanup.
    },
  }
}

/** Write a flat-form skill file: `<base>/skills/universal/<slug>.md`. */
function writeSkill(base: string, slug: string): string {
  const dir = join(base, 'skills', 'universal')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${slug}.md`)
  writeFileSync(
    path,
    `---\nname: ${slug}\ngroup: testing\ndescription: test fixture\n---\nbody\n`,
  )
  return path
}

/** Write a pack's skill at `<packsRoot>/<pack>/skills/universal/<slug>.md`. */
function writePackSkill(packsRoot: string, pack: string, slug: string): string {
  return writeSkill(join(packsRoot, pack), slug)
}

let fixtures: Fixture[] = []

afterEach(() => {
  for (const f of fixtures) f.cleanup()
  fixtures = []
})

function fresh(): Fixture {
  const f = makeFixture()
  fixtures.push(f)
  return f
}

describe('resolvePackSlug — pinned form', () => {
  it('explicit pack always resolves to that pack even if bundled has the same slug', () => {
    const f = fresh()
    writeSkill(f.roots.bundledRoot, 'code-review')
    const myteam = writePackSkill(f.roots.packsRoot, 'myteam', 'code-review')
    const ctx: PackResolveContext = { roots: f.roots }
    const r = resolvePackSlug({ pack: 'myteam', slug: 'code-review' }, ctx)
    expect(r.chosen?.fsPath).toBe(myteam)
    expect(r.chosen?.pack).toBe('myteam')
    expect(r.chosen?.source).toBe('pack')
    expect(r.collision).toBeUndefined()
  })

  it('explicit anvil:slug resolves to bundled', () => {
    const f = fresh()
    const bundled = writeSkill(f.roots.bundledRoot, 'code-review')
    writePackSkill(f.roots.packsRoot, 'myteam', 'code-review')
    const r = resolvePackSlug(
      { pack: BUNDLED_PACK, slug: 'code-review' },
      { roots: f.roots },
    )
    expect(r.chosen?.fsPath).toBe(bundled)
    expect(r.chosen?.source).toBe('bundled')
    expect(r.collision).toBeUndefined()
  })

  it('pinned pack with no match returns empty', () => {
    const f = fresh()
    const r = resolvePackSlug(
      { pack: 'ghost', slug: 'nothing' },
      { roots: f.roots },
    )
    expect(r.matches).toHaveLength(0)
    expect(r.chosen).toBeUndefined()
  })
})

describe('resolvePackSlug — unscoped precedence', () => {
  it('project wins over home wins over bundled', () => {
    const f = fresh()
    const proj = writeSkill(f.roots.projectRoot, 'code-review')
    writeSkill(f.roots.homeRoot, 'code-review')
    writeSkill(f.roots.bundledRoot, 'code-review')
    const r = resolvePackSlug(
      { pack: null, slug: 'code-review' },
      { roots: f.roots },
    )
    expect(r.chosen?.fsPath).toBe(proj)
    expect(r.chosen?.source).toBe('project')
    expect(r.collision).toBeDefined()
    expect(r.collision?.matches.map((m) => m.source)).toEqual([
      'project',
      'home',
      'bundled',
    ])
  })

  it('bundled wins over packs when both have same slug and no pack specified', () => {
    const f = fresh()
    const bundled = writeSkill(f.roots.bundledRoot, 'code-review')
    writePackSkill(f.roots.packsRoot, 'myteam', 'code-review')
    const r = resolvePackSlug(
      { pack: null, slug: 'code-review' },
      { roots: f.roots },
    )
    expect(r.chosen?.fsPath).toBe(bundled)
    expect(r.chosen?.source).toBe('bundled')
    expect(r.collision).toBeDefined()
    expect(r.collision?.matches).toHaveLength(2)
  })

  it('multi-pack collision flagged (no bundled)', () => {
    const f = fresh()
    writePackSkill(f.roots.packsRoot, 'aaa', 'code-review')
    writePackSkill(f.roots.packsRoot, 'bbb', 'code-review')
    const r = resolvePackSlug(
      { pack: null, slug: 'code-review' },
      { roots: f.roots },
    )
    expect(r.matches).toHaveLength(2)
    expect(r.collision).toBeDefined()
    expect(r.collision?.matches.map((m) => m.pack).sort()).toEqual([
      'aaa',
      'bbb',
    ])
  })

  it('no collision when only one match exists', () => {
    const f = fresh()
    writeSkill(f.roots.bundledRoot, 'code-review')
    const r = resolvePackSlug(
      { pack: null, slug: 'code-review' },
      { roots: f.roots },
    )
    expect(r.matches).toHaveLength(1)
    expect(r.collision).toBeUndefined()
  })

  it('packOrder is honoured for installed-pack iteration', () => {
    const f = fresh()
    writePackSkill(f.roots.packsRoot, 'aaa', 'code-review')
    writePackSkill(f.roots.packsRoot, 'bbb', 'code-review')
    const r = resolvePackSlug(
      { pack: null, slug: 'code-review' },
      { roots: f.roots, packOrder: ['bbb', 'aaa'] },
    )
    expect(r.matches[0].pack).toBe('bbb')
    expect(r.matches[1].pack).toBe('aaa')
  })

  it('returns empty when nothing matches anywhere', () => {
    const f = fresh()
    const r = resolvePackSlug(
      { pack: null, slug: 'nothing' },
      { roots: f.roots },
    )
    expect(r.matches).toHaveLength(0)
    expect(r.chosen).toBeUndefined()
    expect(r.collision).toBeUndefined()
  })
})
