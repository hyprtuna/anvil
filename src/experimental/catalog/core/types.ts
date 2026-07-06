/**
 * ANV-0028 (P1) — Zod schemas for the external catalog quarantine system.
 *
 * Layer 0 — pure schemas, no I/O.
 *
 * Design decision: The types ExtensionManifest, ExtensionKind, and SemverString
 * live in src/installer/extensions/types.ts (layer 7). Rather than importing
 * upward (layer 0 → layer 7, which violates the layering rule), the needed
 * schemas are copied inline here. Slug and PackName are imported from layer-0
 * siblings (no violation). EXTRACT_MAX_BYTES is a constant, also copied.
 *
 * This precedent is consistent with the project's stated approach: "copy if no
 * existing cross-layer precedent." No existing core/ → installer/ import edges
 * exist, so we do not introduce one here.
 */

import { z } from 'zod'
import { PackName } from '../../../core/pack/types.js'
import { Slug } from '../../../core/worktree/types.js'

// ─── Re-exported for consumers of this module ─────────────────────────────

export { PackName, Slug }

// ─── ISO8601 datetime string validator ────────────────────────────────────

const ISO8601 = z.string().refine(
  (s) => {
    const d = new Date(s)
    return !Number.isNaN(d.getTime()) && s === d.toISOString()
  },
  {
    message:
      'must be an ISO8601 datetime string (e.g. 2026-05-16T00:00:00.000Z)',
  },
)

// ─── Copied from src/installer/extensions/types.ts ───────────────────────
// These are duplicated here to keep core/ free of upward layer imports.

const semverRegex =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const SemverString = z
  .string()
  .regex(semverRegex, 'must be a semver string (e.g. 1.2.3 or 1.2.3-beta.1)')

const ExtensionKind = z.enum(['extension', 'preset', 'profile'])

const AnvilUriString = z
  .string()
  .min('anvil:'.length + 1)
  .refine((s) => s.startsWith('anvil:'))

const ExtensionCompatibility = z
  .object({
    min_anvil_version: SemverString,
    max_anvil_version: SemverString.optional(),
  })
  .strict()

const ExtensionProvides = z
  .object({
    skill: z.array(Slug).optional(),
    agent: z.array(Slug).optional(),
    hook: z.array(Slug).optional(),
    command: z.array(Slug).optional(),
  })
  .strict()

/** ExtensionManifest — copied from src/installer/extensions/types.ts */
const ExtensionManifest = z
  .object({
    schema_version: SemverString,
    name: Slug,
    version: SemverString,
    description: z.string().min(1),
    kind: ExtensionKind,
    provides: ExtensionProvides.default({}),
    requires: z.array(AnvilUriString).default([]),
    compatibility: ExtensionCompatibility,
  })
  .strict()

/** 256 MiB — copied from src/installer/extensions/types.ts */
export const CATALOG_MAX_BYTES = 256 * 1024 * 1024

// ─── HTTPS URL validator ───────────────────────────────────────────────────

const HttpsUrl = z
  .string()
  .url()
  .refine((s) => s.startsWith('https://'), { message: 'URL must use HTTPS' })

// ─── Mutable branch name guard ─────────────────────────────────────────────

/**
 * Rejects mutable branch names like 'main' and 'master' that cannot be used
 * as a pinned upstream_ref. A valid ref must be a commit SHA or a tag.
 */
const MUTABLE_BRANCH_NAMES = new Set([
  'main',
  'master',
  'HEAD',
  'develop',
  'dev',
])

const PinnedRef = z.string().refine((s) => !MUTABLE_BRANCH_NAMES.has(s), {
  message:
    'upstream_ref must be a pinned commit SHA or tag — mutable branch names (main, master, etc.) are rejected',
})

// ─── §3.1 CatalogSource ───────────────────────────────────────────────────

export const CatalogSource = z.object({
  id: PackName,
  display_name: z.string().min(1),
  index_url: HttpsUrl,
  trust_tier: z.enum(['verified', 'community', 'unknown']),
  default_license_hint: z.string().optional(),
})
export type CatalogSource = z.infer<typeof CatalogSource>

// ─── §3.2 CatalogIndexEntry ───────────────────────────────────────────────

export const CatalogIndexEntry = z.object({
  slug: Slug,
  display_name: z.string().min(1),
  description: z.string(),
  upstream_repo: z.string().min(1),
  upstream_path: z.string().min(1),
  upstream_ref: PinnedRef,
  fetch_url: HttpsUrl,
  fetch_kind: z.enum(['tarball', 'zip', 'tree-listing']),
  declared_license: z.string().optional(),
  declared_kind: ExtensionKind.optional(),
  size_hint_bytes: z.number().int().positive().optional(),
})
export type CatalogIndexEntry = z.infer<typeof CatalogIndexEntry>

// ─── §3.2 CatalogIndex ───────────────────────────────────────────────────

export const CatalogIndex = z.object({
  source_id: PackName,
  schema_version: SemverString,
  fetched_at: ISO8601,
  entries: z.array(CatalogIndexEntry),
})
export type CatalogIndex = z.infer<typeof CatalogIndex>

// ─── §3.3 ProvenanceMetadata ──────────────────────────────────────────────

export const ProvenanceMetadata = z.object({
  source_id: PackName,
  source_repo: z.string().min(1),
  source_path: z.string().min(1),
  vendored_at: ISO8601,
  upstream_license: z.string().min(1),
  upstream_version_or_commit: PinnedRef,
  upstream_license_source: z.enum([
    'plugin.json',
    'LICENSE',
    'declared',
    'unknown',
  ]),
})
export type ProvenanceMetadata = z.infer<typeof ProvenanceMetadata>

// ─── §3.5 ValidationOutcome ───────────────────────────────────────────────

export const ValidationOutcome = z.object({
  id: z.string().min(1),
  severity: z.enum(['block', 'warn', 'info']),
  status: z.enum(['pass', 'fail', 'skip']),
  message: z.string(),
  detail: z.unknown().optional(),
})
export type ValidationOutcome = z.infer<typeof ValidationOutcome>

// ─── §3.5 PromotionResult ─────────────────────────────────────────────────

export const PromotionResult = z.object({
  quarantine_id: z.string().min(1),
  decision: z.enum(['promoted', 'blocked', 'warned-but-promoted']),
  validations: z.array(ValidationOutcome),
  written_paths: z.array(z.string()).optional(),
  rolled_back: z.boolean().optional(),
})
export type PromotionResult = z.infer<typeof PromotionResult>

// ─── Inventory item ───────────────────────────────────────────────────────

const InventoryItem = z.object({
  relpath: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  md5: z.string().min(1),
  role: z.enum(['skill', 'agent', 'hook', 'command', 'doc', 'policy', 'other']),
  token_estimate: z.number().int().nonnegative(),
})

// ─── §3.4 QuarantineRecord ────────────────────────────────────────────────

export const QuarantineRecord = z.object({
  quarantine_id: z.string().min(1),
  schema_version: SemverString,
  created_at: ISO8601,
  source: CatalogSource,
  index_entry: CatalogIndexEntry,
  provenance: ProvenanceMetadata,
  manifest: ExtensionManifest,
  blob_sha256: z.string().min(1),
  content_dir: z.string().min(1),
  inventory: z.array(InventoryItem),
})
export type QuarantineRecord = z.infer<typeof QuarantineRecord>
