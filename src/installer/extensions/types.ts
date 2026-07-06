/**
 * ANV-0027 — Extension manifest schema, errors, and shared types.
 *
 * Library-only surface. No CLI, no I/O, no interactive resolution.
 * Implementation is split: this v0.15.6 ticket lands the schema +
 * path-traversal-safe extractor + collision *detector*. Install UX +
 * interactive resolution land in v0.15.7 as ANV-0203.
 *
 * Cross-references:
 *   - .anvil/specs/anvil-uri-scheme.md (ANV-0095) — the `anvil:` URI grammar
 *     this manifest's `requires[]` strings cite. We validate the `anvil:`
 *     prefix here but defer full URI resolution to `src/core/uri/`.
 *   - the extension-system blueprint.
 */

import { z } from 'zod'
import { Slug } from '../../core/worktree/types.js'

// ─── Resource kinds an extension can export ──────────────────────────────
export const ExtensionResourceKind = z.enum([
  'skill',
  'agent',
  'hook',
  'command',
])
export type ExtensionResourceKind = z.infer<typeof ExtensionResourceKind>

// ─── Extension top-level kind ────────────────────────────────────────────
export const ExtensionKind = z.enum(['extension', 'preset', 'profile'])
export type ExtensionKind = z.infer<typeof ExtensionKind>

// ─── Semver (lenient: x.y.z with optional pre-release/build) ─────────────
const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export const SemverString = z
  .string()
  .regex(semverRegex, 'must be a semver string (e.g. 1.2.3 or 1.2.3-beta.1)')

// ─── anvil: URI prefix validator (full resolution deferred to ANV-0095) ──
export const AnvilUriString = z
  .string()
  .min('anvil:'.length + 1, 'anvil: URI must have content after the scheme')
  .refine((s) => s.startsWith('anvil:'), {
    message: "must start with 'anvil:' (see .anvil/specs/anvil-uri-scheme.md)",
  })
  .refine((s) => s.slice('anvil:'.length).trim().length > 0, {
    message: 'anvil: URI body must be non-empty',
  })

// ─── Compatibility block ─────────────────────────────────────────────────
export const ExtensionCompatibility = z
  .object({
    min_anvil_version: SemverString,
    max_anvil_version: SemverString.optional(),
  })
  .strict()
export type ExtensionCompatibility = z.infer<typeof ExtensionCompatibility>

// ─── Provides map: which slugs the extension exports, keyed by kind ──────
export const ExtensionProvides = z
  .object({
    skill: z.array(Slug).optional(),
    agent: z.array(Slug).optional(),
    hook: z.array(Slug).optional(),
    command: z.array(Slug).optional(),
  })
  .strict()
export type ExtensionProvides = z.infer<typeof ExtensionProvides>

// ─── Top-level manifest ──────────────────────────────────────────────────
export const ExtensionManifest = z
  .object({
    schema_version: SemverString,
    name: Slug,
    version: SemverString,
    description: z.string().min(1, 'description must be non-empty'),
    kind: ExtensionKind,
    provides: ExtensionProvides.default({}),
    requires: z.array(AnvilUriString).default([]),
    compatibility: ExtensionCompatibility,
  })
  .strict()
export type ExtensionManifest = z.infer<typeof ExtensionManifest>

// ─── Errors (Result-shaped, never thrown) ────────────────────────────────
export interface ManifestError {
  code: 'INVALID_MANIFEST'
  message: string
  issues: ReadonlyArray<{ path: string; message: string }>
}

export type ExtractErrorCode =
  | 'ARCHIVE_NOT_FOUND'
  | 'UNSUPPORTED_ARCHIVE'
  | 'PATH_TRAVERSAL'
  | 'SYMLINK_REJECTED'
  | 'ENTRY_CAP_EXCEEDED'
  | 'SIZE_CAP_EXCEEDED'
  | 'EXTRACT_FAILED'
  | 'TARGET_INVALID'

export interface ExtractError {
  code: ExtractErrorCode
  message: string
  detail?: string
}

// ─── Collision detector types ────────────────────────────────────────────
export type CollisionTier = 1 | 2 | 3

export interface Collision {
  tier: CollisionTier
  kind: ExtensionResourceKind | 'extension'
  slug: string
  conflictingSource: string
}

export interface CollisionContext {
  bundled: {
    skill: ReadonlySet<string>
    agent: ReadonlySet<string>
    hook: ReadonlySet<string>
    command: ReadonlySet<string>
  }
  installed: ReadonlyArray<{
    name: string
    provides: ExtensionProvides
  }>
}

// ─── Result envelope ─────────────────────────────────────────────────────
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

// ─── Extractor caps ──────────────────────────────────────────────────────
export const EXTRACT_MAX_ENTRIES = 10_000
export const EXTRACT_MAX_BYTES = 256 * 1024 * 1024 // 256 MiB
