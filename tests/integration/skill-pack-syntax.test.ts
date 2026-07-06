/**
 * ANV-0096 — Integration: `<pack>:<slug>` namespace end-to-end.
 *
 * Verifies the resolver + doctor row work together on a real tmp-dir layout
 * with two fake packs that ship the same skill slug.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PACK_COLLISIONS_CHECK } from '../../src/commands/cli/doctor-checks/pack-collisions.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../src/commands/cli/doctor-registry.js'
import { resolvePackSlug } from '../../src/core/pack/index.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

function writePackSkill(root: string, pack: string, slug: string): string {
  const dir = join(root, pack, 'skills', 'universal')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${slug}.md`)
  writeFileSync(
    path,
    `---\nname: ${slug}\ngroup: testing\ndescription: ${pack} flavour\n---\nbody\n`,
  )
  return path
}

describe('integration: skill pack syntax', () => {
  it('explicit <pack>:<slug> pins to the named pack across same-slug packs', () => {
    const tmp = createTestTmpDir('pack-integration')
    const packsRoot = join(tmp, 'packs')
    const myteam = writePackSkill(packsRoot, 'myteam', 'code-review')
    writePackSkill(packsRoot, 'other', 'code-review')
    const r = resolvePackSlug(
      { pack: 'myteam', slug: 'code-review' },
      {
        roots: {
          projectRoot: join(tmp, 'proj'),
          homeRoot: join(tmp, 'home'),
          bundledRoot: join(tmp, 'bundled'),
          packsRoot,
        },
      },
    )
    expect(r.chosen?.fsPath).toBe(myteam)
    expect(r.chosen?.pack).toBe('myteam')
  })

  it('doctor pack-collisions row warns when two packs ship same slug and bare lookup is used', async () => {
    const tmp = createTestTmpDir('pack-doctor')
    const home = join(tmp, 'home')
    const packsRoot = join(home, 'packs')
    mkdirSync(home, { recursive: true })
    writePackSkill(packsRoot, 'aaa', 'shared-skill')
    writePackSkill(packsRoot, 'bbb', 'shared-skill')

    const ctx: DoctorCheckContext = {
      cwd: join(tmp, 'cwd-no-skills'),
      home,
      anvilHome: home,
      inProject: false,
      skipDetail: 'n/a',
      installScope: 'unknown',
    }
    mkdirSync(ctx.cwd, { recursive: true })

    const rows: DoctorCheckRow[] = []
    await PACK_COLLISIONS_CHECK.runner(ctx, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('warn')
    expect(rows[0].detail).toContain('shared-skill')
    expect(rows[0].detail).toContain('pack:aaa')
    expect(rows[0].detail).toContain('pack:bbb')
  })

  it('doctor pack-collisions row passes silently on a clean install (no overlay, no packs)', async () => {
    const tmp = createTestTmpDir('pack-doctor-clean')
    const ctx: DoctorCheckContext = {
      cwd: join(tmp, 'cwd'),
      home: join(tmp, 'home-empty'),
      anvilHome: join(tmp, 'home-empty'),
      inProject: false,
      skipDetail: 'n/a',
      installScope: 'unknown',
    }
    mkdirSync(ctx.cwd, { recursive: true })
    mkdirSync(ctx.anvilHome, { recursive: true })
    const rows: DoctorCheckRow[] = []
    await PACK_COLLISIONS_CHECK.runner(ctx, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pass')
  })
})
