import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import matter from 'gray-matter'
import { applyDisambiguator } from '../core/disambiguator.js'
import {
  type PackResolveContext,
  type ParsedPackSlug,
  resolvePackSlug,
} from '../core/pack/index.js'
import {
  type Skill,
  SkillFrontmatter,
  type SkillMcpServerRef,
  type SkillScope,
} from '../core/types.js'
import { parseSidecar } from './mcp-providers/parse.js'

export interface LoadSkillsOptions {
  warnOnInvalid?: boolean
  /** When true, only frontmatter is loaded eagerly; body is deferred via bodyLoader. */
  lazy?: boolean
  /**
   * ANV-0123 — physical scope the skill is being loaded from.
   * Stamped onto each loaded skill. Defaults to 'bundled' when omitted.
   */
  scope?: SkillScope
}

const SKILL_META_FILENAMES = new Set(['AGENTS.md', 'CLAUDE.md', 'README.md'])

/**
 * Filename suffix for addendum files — fragments loaded BY a parent skill at
 * runtime (via Read), not standalone skills. Conventionally named
 * `<parent-skill>-anvil-addendum.md` and co-located in the parent's tier.
 * Skipped by the skill loader so they don't surface as "missing frontmatter"
 * errors on every install/doctor run.
 */
const SKILL_ADDENDUM_SUFFIX = '-anvil-addendum.md'

/**
 * The canonical filename for the subdirectory form of a skill.
 *
 * A skill in subdirectory form lives at `<tier>/<slug>/SKILL.md`, with optional
 * sibling directories (`references/`, `scripts/`) for progressive disclosure.
 * When this file exists inside a directory entry, only it is loaded — the
 * directory's other contents (reference docs, scripts) are deliberately ignored
 * by the loader.  (ANV-0061)
 */
export const SUBDIR_SKILL_FILENAME = 'SKILL.md'

export async function loadSkillsFromDir(
  dir: string,
  tier: Skill['tier'],
  opts: LoadSkillsOptions = {},
): Promise<Skill[]> {
  const skills: Skill[] = []
  const entries = await safeReaddirWithTypes(dir)
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      // Subdirectory form (ANV-0061): if the directory contains a SKILL.md,
      // load only that file as the representative skill entry point.  The
      // sibling `references/` and `scripts/` directories are intentionally
      // excluded from skill loading.
      const subdirSkillPath = join(path, SUBDIR_SKILL_FILENAME)
      if (existsSync(subdirSkillPath)) {
        const skill = await loadSkillFile(subdirSkillPath, tier, opts)
        if (skill) skills.push(skill)
        continue
      }
      // No SKILL.md — recurse into the directory as before (handles
      // ui/, rules/, workflows/ subdirs within a tier).
      const nested = await loadSkillsFromDir(path, tier, opts)
      for (const skill of nested) skills.push(skill)
      continue
    }
    if (!entry.isFile()) continue
    if (!entry.name.endsWith('.md')) continue
    if (SKILL_META_FILENAMES.has(entry.name)) continue
    // Addendum files (e.g. `read-background-results-anvil-addendum.md`) are
    // fragments loaded by their parent skill at runtime, not standalone skills.
    // Skip them silently to avoid noisy "missing frontmatter" errors on every
    // install/doctor run.
    if (entry.name.endsWith(SKILL_ADDENDUM_SUFFIX)) continue
    const skill = await loadSkillFile(path, tier, opts)
    if (skill) skills.push(skill)
  }
  return skills
}

export async function loadSkillFile(
  path: string,
  tier: Skill['tier'],
  opts: LoadSkillsOptions = {},
): Promise<Skill | undefined> {
  const raw = await readFile(path, 'utf-8')
  const parsed = matter(raw)
  // Plan 44 Phase B — provenance synthesis (Item 21).
  // Stamp default source/confidence from the tier (file path) when the
  // frontmatter is silent. Explicit declarations always win.
  // Universal/language skills are shipped Anvil content → 'authored' / 1.0.
  // User skills (anywhere else) → 'unknown' (confidence stays undefined).
  // Synthesis runs before .safeParse so .transform() sees the synthesized
  // values and emits correct camelCase aliases.
  // gray-matter caches `parsed.data` by content — clone before mutating so
  // synthesis from one tier doesn't bleed into a later parse of the same file.
  const data = { ...(parsed.data as Record<string, unknown>) }
  if (data.source === undefined) {
    if (tier === 'universal' || tier === 'language') {
      data.source = 'authored'
      if (data.confidence === undefined) data.confidence = 1.0
    } else {
      data.source = 'unknown'
    }
  }
  const result = SkillFrontmatter.safeParse(data)
  if (!result.success) {
    if (opts.warnOnInvalid !== false) {
      console.warn(
        `[anvil] skill load failed: ${path}\n${result.error.issues
          .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
          .join('\n')}`,
      )
    }
    return undefined
  }

  const frontmatter = result.data
  let originalDescription: string | undefined

  // ANV-0206 back-compat shim: disambiguator may be at root (pre-migration)
  // or under x-anvil (post-migration). Read from both locations.
  const disambiguator =
    frontmatter.disambiguator ?? frontmatter['x-anvil']?.disambiguator

  if (disambiguator) {
    try {
      const disambiguated = applyDisambiguator(
        disambiguator,
        frontmatter.description,
      )
      // Mutate the description in the parsed frontmatter record.
      // TypeScript: frontmatter is inferred as the transform output type; cast needed.
      ;(frontmatter as { description: string }).description =
        disambiguated.description
      originalDescription = disambiguated.originalDescription
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[anvil] skill disambiguator error: ${path}\n  ${msg}`)
      return undefined
    }
  }

  // ANV-0037 — merge per-skill `mcp.json` sidecar if present. Sidecar entries
  // win on name collision; frontmatter entries fill any remaining gaps.
  await mergeMcpSidecar(path, frontmatter)

  const scope: SkillScope = opts.scope ?? 'bundled'

  if (opts.lazy) {
    // Lazy mode: capture path in closure; body fetched on first getSkillBody() call.
    const sourcePath = path
    return {
      frontmatter,
      body: undefined,
      bodyLoader: async () => {
        const fileContent = await readFile(sourcePath, 'utf-8')
        const fileParsed = matter(fileContent)
        return fileParsed.content.trim()
      },
      sourcePath,
      tier,
      scope,
      originalDescription,
      defects: [], // populated by resolveSubSkillGraph in load-all.ts
    }
  }

  return {
    frontmatter,
    body: parsed.content.trim(),
    sourcePath: path,
    tier,
    scope,
    originalDescription,
    defects: [], // populated by resolveSubSkillGraph in load-all.ts
  }
}

/**
 * ANV-0096 — sibling entry point that accepts a parsed `<pack>:<slug>` ref.
 *
 * Resolves the reference against the supplied pack roots, then loads the
 * chosen file via `loadSkillFile`. Returns `undefined` when nothing resolves
 * (callers can decide whether to error or fall through). Does NOT replace
 * the bare-slug entry point — existing call sites keep working unchanged.
 *
 * The `tier` argument is derived heuristically from the matched source: pack
 * matches use `'universal'` (packs don't yet carry a tier dimension); project
 * and home matches inherit `'universal'` likewise. Internal callers that need
 * finer tier discrimination should keep using `loadSkillFile` directly.
 */
export async function loadSkillByPackRef(
  ref: ParsedPackSlug,
  ctx: PackResolveContext,
  opts: LoadSkillsOptions = {},
): Promise<Skill | undefined> {
  const resolved = resolvePackSlug(ref, ctx)
  if (!resolved.chosen) return undefined
  const tier: Skill['tier'] = 'universal'
  const scope: SkillScope =
    resolved.chosen.source === 'project'
      ? 'project'
      : resolved.chosen.source === 'home'
        ? 'home'
        : 'bundled'
  return loadSkillFile(resolved.chosen.fsPath, tier, { ...opts, scope })
}

/**
 * ANV-0037 — Look for a sibling `mcp.json` next to the skill file and merge
 * its entries into `frontmatter.mcp_servers`. Sidecar wins on name collision.
 * Tolerant: malformed JSON / failed schema parse warns but does not abort
 * skill loading.
 */
async function mergeMcpSidecar(
  skillPath: string,
  frontmatter: { mcp_servers?: SkillMcpServerRef[] },
): Promise<void> {
  const sidecarPath = join(dirname(skillPath), 'mcp.json')
  if (!existsSync(sidecarPath)) return
  let raw: string
  try {
    raw = await readFile(sidecarPath, 'utf-8')
  } catch (err) {
    console.warn(
      `[anvil] mcp.json sidecar read failed: ${sidecarPath}\n  ${(err as Error).message}`,
    )
    return
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    console.warn(
      `[anvil] mcp.json sidecar invalid JSON: ${sidecarPath}\n  ${(err as Error).message}`,
    )
    return
  }
  const result = parseSidecar(json)
  if (!result.ok) {
    console.warn(
      `[anvil] mcp.json sidecar schema error: ${sidecarPath}\n  ${result.error.message}`,
    )
    return
  }
  const fmRefs: SkillMcpServerRef[] = frontmatter.mcp_servers ?? []
  const byName = new Map<string, SkillMcpServerRef>()
  for (const ref of fmRefs) byName.set(ref.name, ref)
  for (const ref of result.value) byName.set(ref.name, ref) // sidecar wins
  frontmatter.mcp_servers = [...byName.values()]
}

async function safeReaddirWithTypes(
  dir: string,
): Promise<import('node:fs').Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code
    if (code !== 'ENOENT') {
      process.stderr.write(
        `[anvil] skill tier read failed at ${dir}: ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
    return []
  }
}
