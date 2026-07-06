/**
 * ANV-0096 — Resolver for parsed `<pack>:<slug>` references.
 *
 * Precedence (per ticket §2 — "resolution order when invoked without pack
 * prefix"):
 *   1. project skills   — `<projectRoot>/skills/**`
 *   2. home skills      — `<homeRoot>/skills/**`
 *   3. bundled skills   — `<bundledRoot>/skills/**`
 *   4. installed packs  — `<packsRoot>/<pack>/skills/**` (pack-install order)
 *
 * When the parsed input carries an explicit `pack`, resolution is pinned to
 * that pack and never crosses the precedence ladder — `myteam:code-review`
 * always means `myteam`'s `code-review`, never the bundled one.
 *
 * Filesystem touchpoints: `existsSync` and `readdirSync` only. Errors are
 * absorbed (missing dirs → empty match list); this function never throws.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  PackCollisionInfo,
  PackResolution,
  PackResolutionMatch,
  PackResolveContext,
  PackResolveRoots,
  ParsedPackSlug,
} from './types.js'

/** Sentinel pack identifier used for bundled (non-third-party) matches. */
export const BUNDLED_PACK = 'anvil'

/**
 * Per-role search order. Mirrors `src/core/uri/filesystem-map.ts` so resolution
 * stays consistent with the `anvil:` URI resolver.
 */
const SKILL_ROLES = ['role', 'language', 'universal'] as const

/**
 * Resolve a parsed pack-slug reference to its filesystem location(s).
 *
 * The returned `matches` array is ordered by precedence. `chosen` is always
 * the first element (when `matches` is non-empty). When the input was
 * unscoped (`parsed.pack === null`) and ≥2 distinct sources matched, a
 * `collision` summary is set.
 *
 * Pinned input (`parsed.pack !== null`) never produces a collision — that
 * shape is unambiguous by construction.
 */
export function resolvePackSlug(
  parsed: ParsedPackSlug,
  ctx: PackResolveContext,
): PackResolution {
  const { roots } = ctx
  const matches: PackResolutionMatch[] = []

  if (parsed.pack !== null) {
    // Pinned form. Two cases: bundled-by-name (`anvil:<slug>`) or a third-party
    // pack (`<pack>:<slug>`). Either way, only one source is consulted.
    if (parsed.pack === BUNDLED_PACK) {
      const m = findInBundled(parsed.slug, roots)
      if (m) matches.push(m)
    } else {
      const m = findInPack(parsed.pack, parsed.slug, roots)
      if (m) matches.push(m)
    }
    return finalize(parsed, matches)
  }

  // Unscoped — walk full precedence ladder.
  const proj = findInProject(parsed.slug, roots)
  if (proj) matches.push(proj)
  const home = findInHome(parsed.slug, roots)
  if (home) matches.push(home)
  const bundled = findInBundled(parsed.slug, roots)
  if (bundled) matches.push(bundled)
  for (const pack of orderedPacks(roots, ctx.packOrder)) {
    const m = findInPack(pack, parsed.slug, roots)
    if (m) matches.push(m)
  }
  return finalize(parsed, matches)
}

function finalize(
  parsed: ParsedPackSlug,
  matches: PackResolutionMatch[],
): PackResolution {
  const result: PackResolution = { matches }
  if (matches.length > 0) result.chosen = matches[0]
  if (parsed.pack === null && matches.length >= 2) {
    const collision: PackCollisionInfo = { slug: parsed.slug, matches }
    result.collision = collision
  }
  return result
}

// ── filesystem probes ──────────────────────────────────────────────────────

function findInProject(
  slug: string,
  roots: PackResolveRoots,
): PackResolutionMatch | null {
  const base = join(roots.projectRoot, 'skills')
  const fsPath = probeSkillDirs(base, slug)
  if (fsPath === null) return null
  return { source: 'project', pack: BUNDLED_PACK, fsPath }
}

function findInHome(
  slug: string,
  roots: PackResolveRoots,
): PackResolutionMatch | null {
  const base = join(roots.homeRoot, 'skills')
  const fsPath = probeSkillDirs(base, slug)
  if (fsPath === null) return null
  return { source: 'home', pack: BUNDLED_PACK, fsPath }
}

function findInBundled(
  slug: string,
  roots: PackResolveRoots,
): PackResolutionMatch | null {
  const base = join(roots.bundledRoot, 'skills')
  const fsPath = probeSkillDirs(base, slug)
  if (fsPath === null) return null
  return { source: 'bundled', pack: BUNDLED_PACK, fsPath }
}

function findInPack(
  pack: string,
  slug: string,
  roots: PackResolveRoots,
): PackResolutionMatch | null {
  const base = join(roots.packsRoot, pack, 'skills')
  const fsPath = probeSkillDirs(base, slug)
  if (fsPath === null) return null
  return { source: 'pack', pack, fsPath }
}

/**
 * Probe `<base>/<role>/<slug>/SKILL.md` and `<base>/<role>/<slug>.md` for each
 * known role, in role precedence order. Returns the first match or `null`.
 */
function probeSkillDirs(base: string, slug: string): string | null {
  if (!existsSync(base)) return null
  for (const role of SKILL_ROLES) {
    const subdir = join(base, role, slug, 'SKILL.md')
    if (existsSync(subdir)) return subdir
    const flat = join(base, role, `${slug}.md`)
    if (existsSync(flat)) return flat
  }
  // Also accept the subdir form directly under `<base>/<slug>/SKILL.md`
  // (used by installed packs that flatten the role tier).
  const flatSubdir = join(base, slug, 'SKILL.md')
  if (existsSync(flatSubdir)) return flatSubdir
  return null
}

/**
 * Enumerate installed packs in install order. When no explicit order is
 * supplied by the caller, fall back to lexicographic ordering of directory
 * entries under `packsRoot` — deterministic and replayable in tests.
 */
function orderedPacks(
  roots: PackResolveRoots,
  packOrder: string[] | undefined,
): string[] {
  if (packOrder !== undefined) return packOrder
  if (!existsSync(roots.packsRoot)) return []
  let entries: string[]
  try {
    entries = readdirSync(roots.packsRoot)
  } catch {
    return []
  }
  return entries
    .filter((name) => existsSync(join(roots.packsRoot, name, 'skills')))
    .sort()
}
