/**
 * ANV-0096 — `<pack>:<slug>` namespace types.
 *
 * Layer 0. Pure Zod schemas + interfaces; no I/O.
 *
 * Grammar (mirrors the `<pack>` segment of `anvil:` URI scheme — see
 * `src/core/uri/grammar.ts`). The pack regex must stay in sync with the URI
 * resolver's `PACK` constant; a follow-up (ANV-0095 consolidation) will share
 * a single constant. TODO(ANV-0095-consolidation): import from a shared
 * grammar module once one is extracted.
 */

import { z } from 'zod'
import { Slug } from '../worktree/types.js'

/** Lowercase pack-name regex — `[a-z0-9-]+`. */
export const PackName = z
  .string()
  .regex(/^[a-z0-9-]+$/, 'pack name must match [a-z0-9-]+')
  .max(64)
export type PackName = z.infer<typeof PackName>

/** Slug shape (re-export of the canonical worktree Slug). */
export { Slug }

/** Parsed `<pack>:<slug>` (or bare `<slug>`) reference. */
export interface ParsedPackSlug {
  /** `null` when the input was a bare slug (no pack prefix). */
  pack: string | null
  slug: string
}

/** Source of a resolved skill, in precedence order (lowest index = wins). */
export const PackSource = z.enum(['project', 'home', 'bundled', 'pack'])
export type PackSource = z.infer<typeof PackSource>

/** A single filesystem match found during resolution. */
export interface PackResolutionMatch {
  source: PackSource
  /** Named pack identifier; `'anvil'` for bundled. */
  pack: string
  fsPath: string
}

/**
 * Collision marker — emitted when an unscoped (bare) slug input resolves to
 * matches in ≥2 distinct sources (or ≥2 distinct named packs).
 */
export interface PackCollisionInfo {
  slug: string
  matches: PackResolutionMatch[]
}

/** Result of resolving a parsed `<pack>:<slug>` against pack roots. */
export interface PackResolution {
  matches: PackResolutionMatch[]
  /** First match in precedence order, or `undefined` when nothing matched. */
  chosen?: PackResolutionMatch
  /** Set when input was unscoped AND ≥2 matches were found. */
  collision?: PackCollisionInfo
}

/** Resolver filesystem roots. The caller supplies these for pure resolution. */
export interface PackResolveRoots {
  /** The repo being worked on. Project-scoped skills live under `<projectRoot>/skills/`. */
  projectRoot: string
  /** `~/.anvil/`. Home-scoped skills live under `<homeRoot>/skills/`. */
  homeRoot: string
  /** Bundled-skills root (typically the Anvil install's `skills/` dir). */
  bundledRoot: string
  /** Pack-install root, e.g. `~/.anvil/packs/`. Per-pack: `<packsRoot>/<pack>/skills/`. */
  packsRoot: string
}

/** Resolver invocation context. */
export interface PackResolveContext {
  roots: PackResolveRoots
  /** Optional explicit pack-install order (oldest → newest). Defaults to lexicographic. */
  packOrder?: string[]
}
