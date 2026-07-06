import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SkillRegistry } from '../core/registry/skill-registry.js'
import type { Skill, SkillGraph, SkillScope } from '../core/types.js'
import { applyCompositionOverlays } from './composition.js'
import { SkillCycleError } from './errors.js'
import { loadSkillFile, loadSkillsFromDir } from './loader.js'
import {
  type LoadedProviderSkill,
  PROVIDER_DEFINITIONS,
  PROVIDER_ORDER,
  type SkillCollision,
  SkillProvider,
  dedupeSkills,
} from './providers.js'

/**
 * ANV-0123 — project the broader `SkillProvider` rank down to the
 * user-facing `SkillScope` enum (project / home / bundled).
 *
 *   Managed → home    (centrally-managed sits under ~/.anvil)
 *   Project → project
 *   User    → home
 *   Plugin  → home    (plugin-skills live under ~/.anvil)
 *   Harness → home    (CI/harness paths are transient, treat as home)
 *   Bundled → bundled
 */
export function providerToScope(provider: SkillProvider): SkillScope {
  if (provider === SkillProvider.Project) return 'project'
  if (provider === SkillProvider.Bundled) return 'bundled'
  return 'home'
}

/**
 * Subdir-form skill scan (ANV-0013).
 *
 * Looks for `<skillsRoot>/<slug>/SKILL.md` immediate children — the convention
 * used by the installed `~/.anvil/` layout and adopted in source for skills
 * like `using-anvil` that need to live next to siblings (references, scripts).
 *
 * Directories named `universal` or `languages` are reserved for the tier-based
 * scan and are skipped here.
 */
async function loadSubdirFormSkills(
  skillsRoot: string,
  lazy: boolean,
  scope: SkillScope = 'bundled',
): Promise<Skill[]> {
  if (!existsSync(skillsRoot)) return []
  const entries = await readdir(skillsRoot, { withFileTypes: true })
  const out: Skill[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'universal' || entry.name === 'languages') continue
    const skillPath = join(skillsRoot, entry.name, 'SKILL.md')
    if (!existsSync(skillPath)) continue
    const skill = await loadSkillFile(skillPath, 'universal', { lazy, scope })
    if (skill) out.push(skill)
  }
  return out
}

export interface LoadAllOptions {
  skillsRoot: string
  userSkillsDirs?: string[]
  /** When true, skill bodies are deferred until first access via getSkillBody(). */
  lazy?: boolean
  /** Explicit working directory for provider path resolution. Defaults to process.cwd(). */
  cwd?: string
}

/**
 * Loads all skills eagerly (bodies read immediately).
 * This is the original, unchanged behavior.
 */
export async function loadSkillsEager(
  opts: Omit<LoadAllOptions, 'lazy'>,
): Promise<SkillRegistry> {
  const registry = new SkillRegistry()

  const universalDir = join(opts.skillsRoot, 'universal')
  if (existsSync(universalDir)) {
    const universalSkills = await loadSkillsFromDir(universalDir, 'universal', {
      lazy: false,
      scope: 'bundled',
    })
    for (const skill of universalSkills) registry.register(skill)
  }

  const languagesRoot = join(opts.skillsRoot, 'languages')
  if (existsSync(languagesRoot)) {
    const langs = await readdir(languagesRoot)
    for (const lang of langs.sort()) {
      const langDir = join(languagesRoot, lang)
      const langSkills = await loadSkillsFromDir(langDir, 'language', {
        lazy: false,
        scope: 'bundled',
      })
      for (const skill of langSkills) registry.register(skill)
    }
  }

  // Subdir-form skills under skillsRoot (ANV-0013): e.g. skills/using-anvil/SKILL.md
  for (const skill of await loadSubdirFormSkills(
    opts.skillsRoot,
    false,
    'bundled',
  )) {
    registry.register(skill)
  }

  for (const userDir of opts.userSkillsDirs ?? []) {
    if (!existsSync(userDir)) continue
    const userSkills = await loadSkillsFromDir(userDir, 'user', {
      lazy: false,
      scope: 'home',
    })
    for (const skill of userSkills) registry.register(skill)
  }

  // Build sub-skills graph, detect cycles, patch defects (Plan 33 A2)
  resolveSubSkillGraph(registry)

  // Apply content-overlay composition (ANV-0092) after graph is resolved.
  applyCompositionOverlays(registry.getAll())

  return registry
}

/**
 * Loads all skills lazily — only frontmatter is read at startup.
 * Each skill's body is fetched on first access via getSkillBody().
 */
export async function loadSkillsLazy(
  opts: Omit<LoadAllOptions, 'lazy'>,
): Promise<SkillRegistry> {
  const registry = new SkillRegistry()

  const universalDir = join(opts.skillsRoot, 'universal')
  if (existsSync(universalDir)) {
    const universalSkills = await loadSkillsFromDir(universalDir, 'universal', {
      lazy: true,
      scope: 'bundled',
    })
    for (const skill of universalSkills) registry.register(skill)
  }

  const languagesRoot = join(opts.skillsRoot, 'languages')
  if (existsSync(languagesRoot)) {
    const langs = await readdir(languagesRoot)
    for (const lang of langs.sort()) {
      const langDir = join(languagesRoot, lang)
      const langSkills = await loadSkillsFromDir(langDir, 'language', {
        lazy: true,
        scope: 'bundled',
      })
      for (const skill of langSkills) registry.register(skill)
    }
  }

  // Subdir-form skills under skillsRoot (ANV-0013).
  for (const skill of await loadSubdirFormSkills(
    opts.skillsRoot,
    true,
    'bundled',
  )) {
    registry.register(skill)
  }

  for (const userDir of opts.userSkillsDirs ?? []) {
    if (!existsSync(userDir)) continue
    const userSkills = await loadSkillsFromDir(userDir, 'user', {
      lazy: true,
      scope: 'home',
    })
    for (const skill of userSkills) registry.register(skill)
  }

  // Build sub-skills graph, detect cycles, patch defects (Plan 33 A2)
  resolveSubSkillGraph(registry)

  // Apply content-overlay composition (ANV-0092) after graph is resolved.
  applyCompositionOverlays(registry.getAll())

  return registry
}

/**
 * Loads all skills, dispatching to the eager or lazy path based on opts.lazy.
 * opts.lazy comes from the resolved ModelsConfig.skills.lazy_load at startup.
 */
export async function loadAllSkills(
  opts: LoadAllOptions,
): Promise<SkillRegistry> {
  if (opts.lazy) {
    return loadSkillsLazy(opts)
  }
  return loadSkillsEager(opts)
}

/**
 * Resolves whether lazy loading is active, accounting for the `--eager` global
 * flag (ANVIL_EAGER=1 env var) which forces eager mode regardless of config.
 * Pass the resolved `ModelsConfig.skills?.lazy_load` value from the config.
 */
export function resolveIsLazy(configLazyLoad?: boolean): boolean {
  if (process.env.ANVIL_EAGER === '1') return false
  return configLazyLoad ?? false
}

// ─── ANV-0050: Provider stats ────────────────────────────────────────────────

/** Per-provider load count for doctor reporting. */
export interface ProviderStat {
  provider: SkillProvider
  label: string
  loaded: number
  shadowed: number
}

/**
 * ANV-0123 — shadowing record at the user-facing scope granularity.
 * Derived from the broader `SkillCollision` list by projecting each
 * collision's provider onto its scope (project / home / bundled). The
 * doctor surfaces these as "skill-shadow: <slug> Home shadows Bundled".
 */
export interface ScopeShadow {
  slug: string
  /** Winning scope (the skill that loaded). */
  winnerScope: SkillScope
  /** Shadowed scope (suppressed by the winner). */
  shadowedScope: SkillScope
}

/** Summary returned by loadAllSkillsWithProviderStats. */
export interface ProviderLoadResult {
  registry: SkillRegistry
  /** Per-provider counts (in PROVIDER_ORDER rank order). */
  providerStats: ProviderStat[]
  /** Total skills shadowed/deduped across all providers. */
  totalShadowed: number
  /** Slug collisions (same slug, different content). */
  collisions: SkillCollision[]
  /**
   * ANV-0123 — collisions projected onto scopes (project/home/bundled).
   * One entry per distinct (slug, winnerScope, shadowedScope) triple — when
   * the same slug shows up from two providers that share a scope (e.g. two
   * Home paths) the duplicate is collapsed.
   */
  scopeShadows: ScopeShadow[]
}

/**
 * Loads skills from all providers in rank order, deduplicates by
 * SHA-256 of (directory_basename + NUL + content), and returns both
 * the registry and provider stats for doctor reporting.
 *
 * Provider priority: Managed < Project < User < Plugin < Harness < Bundled
 * (lower numeric rank wins on collision).
 *
 * Deferred (ANV-0034):
 *   - `template`/`from` skill inheritance
 *   - `level:` numeric grading
 *   - `.factory`/Droid slot
 *   - Harness-aware dynamic precedence
 *
 * @param opts - Same options as loadAllSkills; skillsRoot maps to Bundled.
 */
export async function loadAllSkillsWithProviderStats(
  opts: LoadAllOptions,
): Promise<ProviderLoadResult> {
  const lazy = opts.lazy ?? false
  const cwd = opts.cwd ?? process.cwd()
  const anvilHome =
    process.env.ANVIL_HOME ?? `${process.env.HOME ?? '~'}/.anvil`

  // Collect all raw skills from every provider, tagged with their provider
  const allLoaded: LoadedProviderSkill[] = []

  for (const provider of PROVIDER_ORDER) {
    const def = PROVIDER_DEFINITIONS[provider]
    const searchPaths = def.searchPaths({ cwd, anvilHome })
    const scope = providerToScope(provider)

    for (const searchPath of searchPaths) {
      if (!existsSync(searchPath)) continue

      if (provider === SkillProvider.Bundled) {
        // Bundled has a structured layout: universal/, languages/<lang>/, and
        // subdir-form skills. Load each tier separately to assign correct tiers
        // and avoid picking up meta-files (AGENTS.md, CLAUDE.md) at the root.
        const universalDir = join(searchPath, 'universal')
        if (existsSync(universalDir)) {
          const uSkills = await loadSkillsFromDir(universalDir, 'universal', {
            lazy,
            scope,
          })
          for (const skill of uSkills) {
            allLoaded.push({
              skill,
              provider,
              dirBasename: basename(universalDir),
            })
          }
        }
        const languagesRoot = join(searchPath, 'languages')
        if (existsSync(languagesRoot)) {
          const langs = await readdir(languagesRoot)
          for (const lang of langs.sort()) {
            const langDir = join(languagesRoot, lang)
            const langSkills = await loadSkillsFromDir(langDir, 'language', {
              lazy,
              scope,
            })
            for (const skill of langSkills) {
              allLoaded.push({
                skill,
                provider,
                dirBasename: basename(langDir),
              })
            }
          }
        }
        const subdirSkills = await loadSubdirFormSkills(searchPath, lazy, scope)
        for (const skill of subdirSkills) {
          allLoaded.push({ skill, provider, dirBasename: basename(searchPath) })
        }
        continue
      }

      const tier =
        provider === SkillProvider.Project || provider === SkillProvider.Managed
          ? ('universal' as const)
          : ('user' as const)

      const skills = await loadSkillsFromDir(searchPath, tier, { lazy, scope })
      const dirBn = basename(searchPath)
      for (const skill of skills) {
        allLoaded.push({ skill, provider, dirBasename: dirBn })
      }
    }

    // User dirs from opts (backward compat with legacy userSkillsDirs)
    if (provider === SkillProvider.User && opts.userSkillsDirs) {
      for (const userDir of opts.userSkillsDirs) {
        if (!existsSync(userDir)) continue
        const userSkills = await loadSkillsFromDir(userDir, 'user', {
          lazy,
          scope,
        })
        for (const skill of userSkills) {
          allLoaded.push({ skill, provider, dirBasename: basename(userDir) })
        }
      }
    }
  }

  // Dedupe pass: lower-rank provider wins on duplicate slug
  const { kept, shadowed, collisions } = dedupeSkills(allLoaded)

  // Provider stats capture shadow/dedup counts; the doctor row surfaces the
  // summary. Per-entry debug logging is suppressed — 100+ entries at startup
  // makes the terminal unreadable without adding diagnostic value.

  // Build registry from kept skills
  const registry = new SkillRegistry()
  for (const entry of kept) {
    registry.register(entry.skill)
  }

  // Build provider stats
  const countByProvider = new Map<SkillProvider, number>()
  const shadowedByProvider = new Map<SkillProvider, number>()
  for (const entry of kept) {
    countByProvider.set(
      entry.provider,
      (countByProvider.get(entry.provider) ?? 0) + 1,
    )
  }
  for (const entry of shadowed) {
    shadowedByProvider.set(
      entry.provider,
      (shadowedByProvider.get(entry.provider) ?? 0) + 1,
    )
  }

  const providerStats: ProviderStat[] = PROVIDER_ORDER.map((p) => ({
    provider: p,
    label: PROVIDER_DEFINITIONS[p].label,
    loaded: countByProvider.get(p) ?? 0,
    shadowed: shadowedByProvider.get(p) ?? 0,
  }))

  // ANV-0123 — project shadowing onto the scope granularity. We iterate the
  // `shadowed` list (every loser, regardless of content equality) so the
  // doctor row warns on identical-content shadows too — the user still
  // wants to know that their Home copy is hiding a Bundled fallback.
  // Pair each loser back with its winner via slug, then collapse duplicates.
  const winnerBySlug = new Map<string, LoadedProviderSkill>()
  for (const entry of kept) {
    winnerBySlug.set(entry.skill.frontmatter.name, entry)
  }
  const scopeShadowSeen = new Set<string>()
  const scopeShadows: ScopeShadow[] = []
  for (const loser of shadowed) {
    const slug = loser.skill.frontmatter.name
    const winner = winnerBySlug.get(slug)
    if (!winner) continue
    const winnerScope = providerToScope(winner.provider)
    const shadowedScope = providerToScope(loser.provider)
    if (winnerScope === shadowedScope) continue // same scope: not a shadow
    const key = `${slug}|${winnerScope}|${shadowedScope}`
    if (scopeShadowSeen.has(key)) continue
    scopeShadowSeen.add(key)
    scopeShadows.push({ slug, winnerScope, shadowedScope })
  }

  // Build sub-skills graph (same as standard paths)
  resolveSubSkillGraph(registry)

  // Apply content-overlay composition (ANV-0092) after graph is resolved.
  applyCompositionOverlays(registry.getAll())

  return {
    registry,
    providerStats,
    totalShadowed: shadowed.length,
    collisions,
    scopeShadows,
  }
}

/**
 * Builds the sub-skills adjacency graph from the registry, runs DFS cycle
 * detection, and patches each skill's `defects[]` for missing references.
 *
 * Throws `SkillCycleError` (with the full cycle path) on any cycle — cycles
 * must be loud at startup, never silently degraded. Missing sub-skill names
 * append a defect entry and log a warning; the parent skill still loads.
 *
 * Returns the `SkillGraph` (adjacency list) for use by `anvil doctor`.
 * (Plan 33 A2)
 */
export function resolveSubSkillGraph(registry: SkillRegistry): SkillGraph {
  const allSkills = registry.getAll()

  // Build adjacency list: only include skills that declare sub_skills
  const nodes = new Map<string, string[]>()
  for (const skill of allSkills) {
    const subSkills = skill.frontmatter.sub_skills
    if (subSkills && subSkills.length > 0) {
      nodes.set(skill.frontmatter.name, subSkills)
    }
  }

  const skillByName = new Map(allSkills.map((s) => [s.frontmatter.name, s]))

  // Patch defects for missing sub-skill references
  for (const [parentName, children] of nodes) {
    const parent = skillByName.get(parentName)
    if (!parent) continue
    for (const childName of children) {
      if (!skillByName.has(childName)) {
        const defect = `sub-skill '${childName}' not found`
        parent.defects.push(defect)
        console.warn(
          `[anvil] skill "${parentName}" declares sub-skill "${childName}" but it is not registered — degraded`,
        )
      }
    }
  }

  // DFS cycle detection — throw SkillCycleError with the full cycle path
  const visited = new Set<string>() // permanently visited (no cycle from here)
  const inStack = new Set<string>() // current DFS path stack
  const pathStack: string[] = [] // ordered path for error message

  function dfs(name: string): void {
    if (visited.has(name)) return
    if (inStack.has(name)) {
      // Cycle detected: find where the cycle starts in pathStack
      const cycleStart = pathStack.indexOf(name)
      throw new SkillCycleError(pathStack.slice(cycleStart))
    }

    inStack.add(name)
    pathStack.push(name)

    const children = nodes.get(name) ?? []
    for (const child of children) {
      // Only recurse into children that themselves have sub_skills
      // (so we don't follow edges to leaf nodes, which can't form cycles)
      dfs(child)
    }

    pathStack.pop()
    inStack.delete(name)
    visited.add(name)
  }

  for (const parentName of nodes.keys()) {
    dfs(parentName)
  }

  return { nodes }
}
