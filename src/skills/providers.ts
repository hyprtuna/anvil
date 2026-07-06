/**
 * ANV-0050 — Skill provider precedence + SHA-256 content-hash dedupe.
 *
 * Defines the ordered `SkillProvider` enum and supporting data structures.
 * Lower numeric rank = higher priority (Managed=0 beats Bundled=50).
 *
 * Adapts the Warp multi-provider pattern; independently reimplemented in
 * TypeScript — do not copy Rust source verbatim (Warp is AGPL).
 *
 * Deferred (ANV-0034 unique requirements):
 *   - `template`/`from` skill inheritance (OmO pattern)
 *   - `level:` numeric grading (OMC pattern)
 *   - `.factory`/Droid provider slot
 *   - Harness-aware dynamic precedence (static order used for v1)
 */
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { getUserHome } from '../core/io/home.js'
import type { Skill } from '../core/types.js'

// ─── Provider enum ───────────────────────────────────────────────────────────

/**
 * Named skill provider sources with explicit numeric ranks.
 * Lower rank = higher priority; a lower-rank provider's skill wins on collision.
 *
 * Rank gaps allow future providers to be inserted without renumbering:
 *   Managed=0, Project=10, User=20, Plugin=30, Harness=40, Bundled=50
 */
export enum SkillProvider {
  /** Centrally-managed / org-distributed skills (highest priority). */
  Managed = 0,
  /** Project-local skills (`<cwd>/.claude/skills/`, `<cwd>/skills/`). */
  Project = 10,
  /** User-home skills (`~/.anvil/skills/`, `~/.claude/skills/`). */
  User = 20,
  /** Third-party plugin skills installed via `anvil plugin install`. */
  Plugin = 30,
  /** CI / harness-injected skills (runtime path, transient). */
  Harness = 40,
  /** Anvil-bundled built-in skills (`skills/` in the Anvil source tree). */
  Bundled = 50,
}

// ─── Provider order ───────────────────────────────────────────────────────────

/**
 * Canonical iteration order: sorted ascending by rank.
 * This is the golden list tested by the provider order snapshot test.
 * Adding a provider without updating this list will fail the snapshot test.
 */
export const PROVIDER_ORDER: readonly SkillProvider[] = [
  SkillProvider.Managed,
  SkillProvider.Project,
  SkillProvider.User,
  SkillProvider.Plugin,
  SkillProvider.Harness,
  SkillProvider.Bundled,
]

// ─── Provider definition ──────────────────────────────────────────────────────

export interface ProviderDefinition {
  /** Human-readable display name for doctor output. */
  label: string
  /**
   * Absolute search paths for this provider.
   * These are resolved at runtime; paths that don't exist are silently skipped.
   * A factory function receives `cwd` and `anvilHome` so path resolution
   * stays pure and testable.
   */
  searchPaths: (opts: { cwd: string; anvilHome: string }) => string[]
}

/**
 * Provider definition table.
 * Maps each `SkillProvider` to its label and search-path factory.
 */
export const PROVIDER_DEFINITIONS: Readonly<
  Record<SkillProvider, ProviderDefinition>
> = {
  [SkillProvider.Managed]: {
    label: 'Managed',
    // Managed skills come from a network/org source; no local path by default.
    // Placeholder: future `~/.anvil/managed-skills/` or env-var override.
    searchPaths: ({ anvilHome }) => [join(anvilHome, 'managed-skills')],
  },
  [SkillProvider.Project]: {
    label: 'Project',
    searchPaths: ({ cwd }) => [
      join(cwd, '.claude', 'skills'),
      join(cwd, '.opencode', 'skills'),
    ],
  },
  [SkillProvider.User]: {
    label: 'User',
    searchPaths: ({ anvilHome }) => [
      join(anvilHome, 'skills'),
      join(getUserHome(), '.claude', 'skills'),
      join(getUserHome(), '.opencode', 'skills'),
    ],
  },
  [SkillProvider.Plugin]: {
    label: 'Plugin',
    searchPaths: ({ anvilHome }) => [join(anvilHome, 'plugin-skills')],
  },
  [SkillProvider.Harness]: {
    label: 'Harness',
    // Harness paths come from the ANVIL_HARNESS_SKILLS_DIR env var at runtime.
    // Empty array here; the loader checks the env var explicitly.
    searchPaths: () =>
      process.env.ANVIL_HARNESS_SKILLS_DIR
        ? [process.env.ANVIL_HARNESS_SKILLS_DIR]
        : [],
  },
  [SkillProvider.Bundled]: {
    label: 'Bundled',
    searchPaths: ({ cwd }) => [join(cwd, 'skills')],
  },
}

// ─── Loaded provider skill ────────────────────────────────────────────────────

/**
 * A `Skill` annotated with the provider it was loaded from and the
 * directory basename used for hash computation.
 */
export interface LoadedProviderSkill {
  skill: Skill
  provider: SkillProvider
  /** Basename of the directory the skill was found in (used for content hash). */
  dirBasename: string
}

// ─── Content hash ─────────────────────────────────────────────────────────────

/**
 * SHA-256 of `(dirBasename + NUL + content)`.
 *
 * Using `node:crypto` — content-addressing only, not crypto-strength.
 * The NUL separator prevents collisions between `"dir" + "content"` and
 * `"di" + "rcontent"`.
 */
export function contentHash(dirBasename: string, content: string): string {
  return createHash('sha256').update(`${dirBasename}\0${content}`).digest('hex')
}

// ─── Dedupe result ────────────────────────────────────────────────────────────

export interface SkillCollision {
  /** The skill slug (frontmatter.name) that collided. */
  slug: string
  /** The higher-rank provider's entry that was kept. */
  winner: LoadedProviderSkill
  /** The lower-rank provider's entry that was shadowed. */
  loser: LoadedProviderSkill
}

export interface DedupeResult {
  /** Skills that survived deduplication (one per slug). */
  kept: LoadedProviderSkill[]
  /** Skills that were shadowed by a higher-rank entry with identical content. */
  shadowed: LoadedProviderSkill[]
  /**
   * Slug collisions where both providers shipped different content.
   * The winner is still kept; this array surfaces the conflict for
   * doctor reporting and debug logs.
   */
  collisions: SkillCollision[]
}

// ─── Dedupe pass ──────────────────────────────────────────────────────────────

/**
 * Deduplicates a list of `LoadedProviderSkill` entries.
 *
 * Algorithm:
 * 1. For each unique slug, collect all entries sorted by rank (lower = higher
 *    priority).
 * 2. The lowest-rank entry wins (becomes `kept`).
 * 3. If a losing entry has identical content to the winner → `shadowed`.
 * 4. If a losing entry has different content → `collisions` (and `shadowed`).
 *
 * Input order does not matter — sorting is done by provider rank.
 *
 * @param skills - All loaded skills from all providers (may have duplicate slugs).
 */
export function dedupeSkills(skills: LoadedProviderSkill[]): DedupeResult {
  const kept: LoadedProviderSkill[] = []
  const shadowed: LoadedProviderSkill[] = []
  const collisions: SkillCollision[] = []

  // Group by slug
  const bySlug = new Map<string, LoadedProviderSkill[]>()
  for (const entry of skills) {
    const slug = entry.skill.frontmatter.name
    const group = bySlug.get(slug)
    if (group) {
      group.push(entry)
    } else {
      bySlug.set(slug, [entry])
    }
  }

  for (const [slug, entries] of bySlug) {
    // Sort ascending by provider rank; lower rank = higher priority
    const sorted = [...entries].sort((a, b) => a.provider - b.provider)
    const winner = sorted[0]
    kept.push(winner)

    const winnerHash = contentHash(
      winner.dirBasename,
      winner.skill.body ?? winner.skill.frontmatter.description,
    )

    for (const loser of sorted.slice(1)) {
      const loserHash = contentHash(
        loser.dirBasename,
        loser.skill.body ?? loser.skill.frontmatter.description,
      )
      shadowed.push(loser)
      if (loserHash !== winnerHash) {
        collisions.push({ slug, winner, loser })
      }
    }
  }

  return { kept, shadowed, collisions }
}
