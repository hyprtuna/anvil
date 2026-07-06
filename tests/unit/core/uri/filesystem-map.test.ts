import { describe, expect, it } from 'vitest'
import {
  BUNDLED_PACK,
  filesystemMap,
} from '../../../../src/core/uri/filesystem-map.js'
import type { ResolveRoots } from '../../../../src/core/uri/types.js'

const ROOTS: ResolveRoots = {
  projectRoot: '/proj',
  homeRoot: '/home/u/.anvil',
  bundledRoot: '/bundled',
  packsRoot: '/home/u/.anvil/packs',
}

describe('core/uri/filesystem-map — filesystemMap', () => {
  it('maps bundled skill to bundledRoot/skills/<role>/<slug>/SKILL.md across roles', () => {
    const cands = filesystemMap({ kind: 'skill', slug: 'code-review' }, ROOTS)
    const paths = cands.map((c) => c.path)
    expect(paths).toContain('/bundled/skills/role/code-review/SKILL.md')
    expect(paths).toContain('/bundled/skills/language/code-review/SKILL.md')
    expect(paths).toContain('/bundled/skills/universal/code-review/SKILL.md')
    // Also includes the flat single-file form used by repo today.
    expect(paths).toContain('/bundled/skills/universal/code-review.md')
    for (const c of cands) expect(c.root).toBe('/bundled')
  })

  it('maps pack-qualified skill under packsRoot/<pack>/skills/...', () => {
    const cands = filesystemMap(
      { kind: 'skill', slug: 'code-review', pack: 'myteam' },
      ROOTS,
    )
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) {
      expect(c.path.startsWith('/home/u/.anvil/packs/myteam/')).toBe(true)
      expect(c.root).toBe('/home/u/.anvil/packs')
    }
  })

  it('maps bundled agent to bundledRoot/agents/<slug>.md', () => {
    const cands = filesystemMap(
      { kind: 'agent', slug: 'code-architect' },
      ROOTS,
    )
    expect(cands).toEqual([
      { path: '/bundled/agents/code-architect.md', root: '/bundled' },
    ])
  })

  it('maps pack agent under packsRoot', () => {
    const cands = filesystemMap(
      { kind: 'agent', slug: 'thing', pack: 'team' },
      ROOTS,
    )
    expect(cands[0].path).toBe('/home/u/.anvil/packs/team/agents/thing.md')
    expect(cands[0].root).toBe('/home/u/.anvil/packs')
  })

  it('maps bundled hook to src/hooks/handlers/<slug>.ts', () => {
    const cands = filesystemMap({ kind: 'hook', slug: 'session-start' }, ROOTS)
    expect(cands[0].path).toBe('/bundled/src/hooks/handlers/session-start.ts')
  })

  it('reserves pack-shipped hooks (returns no candidates)', () => {
    const cands = filesystemMap(
      { kind: 'hook', slug: 'session-start', pack: 'team' },
      ROOTS,
    )
    expect(cands).toEqual([])
  })

  it('maps bundled command + slash', () => {
    expect(
      filesystemMap({ kind: 'command', slug: 'init' }, ROOTS)[0].path,
    ).toBe('/bundled/src/commands/cli/init.ts')
    expect(filesystemMap({ kind: 'slash', slug: 'init' }, ROOTS)[0].path).toBe(
      '/bundled/src/commands/slash/init.md',
    )
  })

  it('maps plan under projectRoot with .plan.md preferred over releases/', () => {
    const cands = filesystemMap({ kind: 'plan', slug: 'v0.15.6' }, ROOTS)
    expect(cands[0].path).toBe('/proj/.anvil/plans/v0.15.6.plan.md')
    expect(cands[1].path).toBe('/proj/docs/anvil/releases/v0.15.6.md')
    for (const c of cands) expect(c.root).toBe('/proj')
  })

  it('maps ticket under projectRoot as a glob', () => {
    const cands = filesystemMap({ kind: 'ticket', slug: 'ANV-0095' }, ROOTS)
    expect(cands[0].path).toBe('/proj/.anvil/tickets/ANV-0095-*.md')
    expect(cands[0].glob).toBe(true)
    expect(cands[0].root).toBe('/proj')
  })

  it('exports BUNDLED_PACK sentinel as the string "anvil"', () => {
    expect(BUNDLED_PACK).toBe('anvil')
  })
})
