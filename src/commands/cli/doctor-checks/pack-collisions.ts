/**
 * ANV-0096 — Doctor row: Pack collisions.
 *
 * Reports any bare-slug skill reference that resolves to ≥2 distinct sources
 * (project / home / bundled / installed packs). When a collision exists the
 * user must qualify the invocation explicitly as `<pack>:<slug>` to pick a
 * specific source.
 *
 * Audience: user-meaningful. The row is `pass` when no collisions are found
 * (the common case for a fresh install with no third-party packs).
 *
 * Detection algorithm:
 *   1. Enumerate every skill slug discoverable at any of the four roots
 *      (project / home / bundled / packs).
 *   2. For each, call `resolvePackSlug({ pack: null, slug })`.
 *   3. Collect slugs whose resolution returned a `collision` summary.
 *
 * The check is silent on a clean machine (no `~/.anvil/packs/`, no project
 * `skills/` override) — it only surfaces when there's something to disambiguate.
 */

import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type PackResolveRoots,
  resolvePackSlug,
} from '../../../core/pack/index.js'
import type {
  DoctorCheck,
  DoctorCheckContext,
  DoctorCheckRow,
} from '../doctor-registry.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
// dist/src/commands/cli/doctor-checks/ → repo root requires four `..`.
// Source-tree resolution lands at the same place because the test harness
// runs from `src/commands/cli/doctor-checks/`.
const BUNDLED_ROOT = join(__dirname, '..', '..', '..', '..')

const SKILL_ROLES = ['role', 'language', 'universal'] as const

/**
 * Discover every candidate skill slug across all roots. Used only by the
 * doctor row — production resolution paths know which slug they want and
 * call `resolvePackSlug` directly.
 */
async function discoverAllSlugs(roots: PackResolveRoots): Promise<Set<string>> {
  const slugs = new Set<string>()
  const sources: Array<{ base: string; roleScoped: boolean }> = [
    { base: join(roots.projectRoot, 'skills'), roleScoped: true },
    { base: join(roots.homeRoot, 'skills'), roleScoped: true },
    { base: join(roots.bundledRoot, 'skills'), roleScoped: true },
  ]
  // Installed packs.
  if (existsSync(roots.packsRoot)) {
    let packDirs: string[] = []
    try {
      packDirs = await readdir(roots.packsRoot)
    } catch {
      packDirs = []
    }
    for (const pack of packDirs) {
      sources.push({
        base: join(roots.packsRoot, pack, 'skills'),
        roleScoped: true,
      })
    }
  }
  for (const { base, roleScoped } of sources) {
    if (!existsSync(base)) continue
    if (roleScoped) {
      for (const role of SKILL_ROLES) {
        const roleDir = join(base, role)
        if (!existsSync(roleDir)) continue
        let entries: string[] = []
        try {
          entries = await readdir(roleDir)
        } catch {
          continue
        }
        for (const entry of entries) {
          if (entry.endsWith('.md')) {
            slugs.add(entry.slice(0, -'.md'.length))
          } else if (existsSync(join(roleDir, entry, 'SKILL.md'))) {
            slugs.add(entry)
          }
        }
      }
    }
  }
  return slugs
}

async function runPackCollisionsCheck(
  ctx: DoctorCheckContext,
  rows: DoctorCheckRow[],
): Promise<void> {
  const roots: PackResolveRoots = {
    projectRoot: ctx.cwd,
    homeRoot: ctx.anvilHome,
    bundledRoot: BUNDLED_ROOT,
    packsRoot: join(ctx.anvilHome, 'packs'),
  }
  // Short-circuit: if neither the home overlay nor any pack directory exist,
  // collision is impossible — emit a quiet pass.
  const homeSkills = join(roots.homeRoot, 'skills')
  const hasOverlay = existsSync(homeSkills) || existsSync(roots.packsRoot)
  if (!hasOverlay) {
    rows.push({
      name: 'Pack collisions',
      status: 'pass',
      detail: 'no third-party packs or home overlay — nothing to disambiguate',
    })
    return
  }

  let slugs: Set<string>
  try {
    slugs = await discoverAllSlugs(roots)
  } catch {
    rows.push({
      name: 'Pack collisions',
      status: 'pass',
      detail: 'skipped — could not enumerate skill roots',
    })
    return
  }

  const collisions: Array<{ slug: string; sources: string[] }> = []
  for (const slug of slugs) {
    const r = resolvePackSlug({ pack: null, slug }, { roots })
    if (r.collision) {
      const sources = r.collision.matches.map((m) =>
        m.source === 'pack' ? `pack:${m.pack}` : m.source,
      )
      collisions.push({ slug, sources })
    }
  }

  if (collisions.length === 0) {
    rows.push({
      name: 'Pack collisions',
      status: 'pass',
      detail: 'no slug collisions across project/home/bundled/packs',
    })
    return
  }

  const sample = collisions
    .slice(0, 3)
    .map((c) => `${c.slug} (${c.sources.join(', ')})`)
    .join('; ')
  const more = collisions.length > 3 ? ` (+${collisions.length - 3} more)` : ''
  rows.push({
    name: 'Pack collisions',
    status: 'warn',
    detail: `${collisions.length} colliding slug(s) — qualify with <pack>:<slug>. Examples: ${sample}${more}`,
  })
}

export const PACK_COLLISIONS_CHECK: DoctorCheck = {
  id: 'pack/collisions',
  label: 'Pack collisions',
  category: 'content',
  runner: runPackCollisionsCheck,
  silentOnPass: true,
}

export const PACK_COLLISIONS_CHECKS: readonly DoctorCheck[] = [
  PACK_COLLISIONS_CHECK,
]
