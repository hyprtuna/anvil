import { join } from 'node:path'
import type { ParsedUri, ResolveRoots, ResourceKind } from './types.js'

// ---------------------------------------------------------------------------
// ANV-0095 — anvil: URI kind → filesystem mapping
// Pure: returns candidate paths and the root each candidate must live under.
// Order matters: callers try entries in order; first existing wins.
// ---------------------------------------------------------------------------

/** Sentinel pack value meaning "bundled, not a third-party pack". */
export const BUNDLED_PACK = 'anvil'

/**
 * One candidate filesystem path for a parsed URI.
 *
 * - `path`: absolute or repo-relative candidate path (caller may glob if
 *   `glob` is true; the glob pattern is the value of `path`).
 * - `root`: the root that `path` must remain under (traversal guard).
 * - `glob`: true if the candidate uses a `*` wildcard segment (ticket files
 *   have a descriptive suffix after the ANV-ID).
 */
export interface FsCandidate {
  path: string
  root: string
  glob?: boolean
}

/**
 * Skill role precedence — searched in this order when no role is specified
 * in the URI (RFC §9 OQ-4 resolution: universal lowest precedence, role
 * highest; first-match-wins means we search role first, then language,
 * then universal). Mirrors registry override order.
 */
const SKILL_ROLES = ['role', 'language', 'universal'] as const

/**
 * Compute the candidate filesystem paths for a parsed URI. The caller
 * (resolve.ts) walks the list, checks existence, then applies the traversal
 * guard against `root`.
 *
 * Pure: no I/O. The list order encodes precedence.
 */
export function filesystemMap(
  parsed: ParsedUri & { kind: ResourceKind },
  roots: ResolveRoots,
): FsCandidate[] {
  const pack = parsed.pack ?? BUNDLED_PACK
  const slug = parsed.slug

  switch (parsed.kind) {
    case 'skill':
      return skillCandidates(pack, slug, roots)
    case 'agent':
      return agentCandidates(pack, slug, roots)
    case 'hook':
      // Pack-shipped hooks reserved (RFC §3.2) — only bundled supported today.
      if (pack !== BUNDLED_PACK) return []
      return [
        {
          path: join(
            roots.bundledRoot,
            'src',
            'hooks',
            'handlers',
            `${slug}.ts`,
          ),
          root: roots.bundledRoot,
        },
      ]
    case 'command':
      if (pack !== BUNDLED_PACK) return []
      return [
        {
          path: join(roots.bundledRoot, 'src', 'commands', 'cli', `${slug}.ts`),
          root: roots.bundledRoot,
        },
      ]
    case 'slash':
      if (pack !== BUNDLED_PACK) return []
      return [
        {
          path: join(
            roots.bundledRoot,
            'src',
            'commands',
            'slash',
            `${slug}.md`,
          ),
          root: roots.bundledRoot,
        },
      ]
    case 'plan':
      // RFC §3.2: plan files always under projectRoot. Prefer in-flight
      // `.anvil/plans/<version>.plan.md`, fall back to released
      // `docs/anvil/releases/<version>.md`.
      return [
        {
          path: join(roots.projectRoot, '.anvil', 'plans', `${slug}.plan.md`),
          root: roots.projectRoot,
        },
        {
          path: join(
            roots.projectRoot,
            'docs',
            'anvil',
            'releases',
            `${slug}.md`,
          ),
          root: roots.projectRoot,
        },
      ]
    case 'ticket':
      // Tickets glob-match `<ANV-NNNN>-*.md`.
      return [
        {
          path: join(roots.projectRoot, '.anvil', 'tickets', `${slug}-*.md`),
          root: roots.projectRoot,
          glob: true,
        },
      ]
  }
}

function skillCandidates(
  pack: string,
  slug: string,
  roots: ResolveRoots,
): FsCandidate[] {
  if (pack === BUNDLED_PACK) {
    // Skills live under bundledRoot/skills/<role>/<slug>/SKILL.md.
    // Also support flat single-file form `skills/<role>/<slug>.md` (the
    // current repo uses both shapes, e.g. autonomous-execution.md).
    const out: FsCandidate[] = []
    for (const role of SKILL_ROLES) {
      out.push({
        path: join(roots.bundledRoot, 'skills', role, slug, 'SKILL.md'),
        root: roots.bundledRoot,
      })
      out.push({
        path: join(roots.bundledRoot, 'skills', role, `${slug}.md`),
        root: roots.bundledRoot,
      })
    }
    return out
  }
  // Pack-qualified skill: <packsRoot>/<pack>/skills/<role>/<slug>/SKILL.md.
  const out: FsCandidate[] = []
  const packRoot = join(roots.packsRoot, pack)
  for (const role of SKILL_ROLES) {
    out.push({
      path: join(packRoot, 'skills', role, slug, 'SKILL.md'),
      root: roots.packsRoot,
    })
    out.push({
      path: join(packRoot, 'skills', role, `${slug}.md`),
      root: roots.packsRoot,
    })
  }
  return out
}

function agentCandidates(
  pack: string,
  slug: string,
  roots: ResolveRoots,
): FsCandidate[] {
  if (pack === BUNDLED_PACK) {
    return [
      {
        path: join(roots.bundledRoot, 'agents', `${slug}.md`),
        root: roots.bundledRoot,
      },
    ]
  }
  return [
    {
      path: join(roots.packsRoot, pack, 'agents', `${slug}.md`),
      root: roots.packsRoot,
    },
  ]
}
