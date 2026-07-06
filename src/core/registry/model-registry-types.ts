/**
 * ANV-0211 — Model Registry Types
 *
 * Two-axis abstraction for model assignment: `role × intensity`.
 * Introduced in v0.17 as the registry schema; the legacy six-tier enum
 * (`quick|coding|review|planning|ultra|super`) is a back-compat alias
 * that maps to fixed (role, intensity) pairs.
 *
 * Reference: .anvil/research/anv-0251-tier-system-reconciliation.research.md
 */

import type { EffortLevel } from '../types.js'

// ─── Role ────────────────────────────────────────────────────────────────────
/**
 * What kind of work this skill/agent performs.
 * Drives the default model-class selection via the preset matrix.
 *
 * Mapping from the six legacy tier names:
 *   quick      → small
 *   coding     → coding
 *   review     → review
 *   planning   → planning
 *   ultra      → autonomous
 *   super      → autonomous
 */
export type Role = 'small' | 'coding' | 'review' | 'planning' | 'autonomous'

// ─── Intensity ───────────────────────────────────────────────────────────────
/**
 * How hard to think within a role. Drives default effort selection.
 *
 *   low      → minimal reasoning (haiku; effort dropped)
 *   standard → normal reasoning (medium effort)
 *   deep     → extended thinking (high/xhigh effort)
 *   max      → maximum effort (autonomous/audit)
 */
export type Intensity = 'low' | 'standard' | 'deep' | 'max'

// ─── Legacy tier names (back-compat) ─────────────────────────────────────────
/** The six original tier names; kept for back-compat. Deprecated in v0.19. */
export type LegacyTier =
  | 'quick'
  | 'coding'
  | 'review'
  | 'planning'
  | 'ultra'
  | 'super'

// ─── ModelAssignment ─────────────────────────────────────────────────────────
/**
 * Per-skill / per-agent model assignment stored in the registry.
 *
 * `role` answers "which row of the preset matrix do I belong to".
 * `intensity` answers "how much to spend within that row".
 *
 * Escape hatches (rare — prefer role+intensity):
 *   `model`      — concrete alias override (e.g. 'opus', 'cheap', 'balanced')
 *   `effort`     — pin a specific effort level
 *   `max_tokens` — output budget; used by autonomous/audit skills
 *   `temperature`— OpenCode-only creativity axis. CC adapter must doctor-warn if set.
 */
export interface ModelAssignment {
  role: Role
  intensity?: Intensity
  /** Concrete model alias override (e.g. 'opus', 'sonnet', 'cheap'). */
  model?: string
  /** Pinned effort level; takes precedence over role/intensity defaults. */
  effort?: EffortLevel
  /** Maximum output token budget. Used by autonomous agents and security audits. */
  max_tokens?: number
  /**
   * OpenCode-only temperature knob (creativity/sampling axis).
   * CC adapter MUST emit a doctor-warn if this field is present.
   * Orthogonal to `effort` (which is a thinking-budget axis).
   */
  temperature?: number
}

// ─── RegistryEntry ───────────────────────────────────────────────────────────
/**
 * A registry entry wraps a `ModelAssignment` with provenance metadata.
 *
 * `source` tracks how this entry was registered:
 *   'default'     — seeded from defaults.ts at build time
 *   'frontmatter' — read from skill/agent frontmatter at load time
 *   'override'    — set via anvil.toml per-name override
 *   'env'         — set via environment variable
 *   'cli'         — set via CLI flag
 */
export interface RegistryEntry extends ModelAssignment {
  source: 'default' | 'frontmatter' | 'override' | 'env' | 'cli'
}

// ─── tierToAssignment ────────────────────────────────────────────────────────
/**
 * Maps a legacy tier name to a (role, intensity) pair.
 * Used during registry seeding to ingest the defaults.ts agents table
 * and any frontmatter `tier:` declarations without a manual rewrite.
 *
 * `super` and `ultra` both map to `autonomous` role — they were always
 * two intensity dials of the same task class.
 */
export function tierToAssignment(
  tier: LegacyTier,
): Pick<ModelAssignment, 'role' | 'intensity'> {
  const MAP: Record<LegacyTier, Pick<ModelAssignment, 'role' | 'intensity'>> = {
    quick: { role: 'small', intensity: 'low' },
    coding: { role: 'coding', intensity: 'standard' },
    review: { role: 'review', intensity: 'standard' },
    planning: { role: 'planning', intensity: 'standard' },
    ultra: { role: 'autonomous', intensity: 'deep' },
    super: { role: 'autonomous', intensity: 'max' },
  }
  return MAP[tier]
}
