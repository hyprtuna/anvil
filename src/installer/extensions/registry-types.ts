/**
 * ANV-0203 (P1) — Zod schemas for the extension registry data model.
 *
 * Pure data layer — no I/O. All external input must be validated through
 * these schemas. Imported by: registry.ts, install-pipeline.ts (P2),
 * doctor-checks/extensions.ts (P6), and test fixtures.
 *
 * Layer 7 — installer leaf. Imports from: zod (layer 0), types.ts (sibling).
 */

import { z } from 'zod'
import { Slug } from '../../core/worktree/types.js'
import { ExtensionManifest, SemverString } from './types.js'

// ─── InstallSource — discriminated union of install origin ──────────────────

export const InstallSource = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('archive'),
      path: z.string().min(1),
      sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/, 'sha256 must be 64 lowercase hex chars'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('directory'),
      path: z.string().min(1),
    })
    .strict(),
  // Future: kind: 'https' — out of scope for ANV-0203.
])
export type InstallSource = z.infer<typeof InstallSource>

// ─── InstallRecord — per-extension .install.json ─────────────────────────────

export const InstallRecord = z
  .object({
    /** Record-format version, NOT the manifest's schema_version. */
    schema_version: SemverString,
    /** Mirrors manifest.name. Validated as Slug (no leading _). */
    name: Slug,
    /** Mirrors manifest.version. */
    version: SemverString,
    /** ISO-8601 datetime when the extension was installed. */
    installed_at: z.string().datetime(),
    /** Where the extension was installed from. */
    source: InstallSource,
    /** Verbatim copy of the validated manifest (denormalised for fast doctor reads). */
    manifest: ExtensionManifest,
  })
  .strict()
export type InstallRecord = z.infer<typeof InstallRecord>

// ─── Registry — _registry.json shape ─────────────────────────────────────────

export const Registry = z
  .object({
    /**
     * Registry-file format version. Hand-pinned literal; bump on breaking
     * structural change. Distinct from any manifest's schema_version.
     */
    schema_version: z.literal('1.0.0'),
    /** Keyed by extension name (Slug). */
    extensions: z.record(Slug, InstallRecord),
  })
  .strict()
export type Registry = z.infer<typeof Registry>

/** The empty registry used when _registry.json does not exist yet. */
export const EMPTY_REGISTRY: Registry = {
  schema_version: '1.0.0',
  extensions: {},
}

// ─── UninstallRequest ─────────────────────────────────────────────────────────

export const UninstallRequest = z
  .object({
    name: Slug,
    force: z.boolean().default(false),
  })
  .strict()
export type UninstallRequest = z.infer<typeof UninstallRequest>

// ─── ExtensionsDoctorRow — testable pure structure (P6 builder output) ────────

export const ExtensionsDoctorRow = z
  .object({
    installedCount: z.number().int().nonnegative(),
    schemaInvalid: z.array(z.object({ name: Slug, reason: z.string() })),
    unresolvedCollisions: z.array(
      z.object({
        name: Slug,
        collisions: z.array(
          z.object({
            tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
            kind: z.string(),
            slug: z.string(),
          }),
        ),
      }),
    ),
    /** Non-null iff _registry.json is unreadable or fails Zod validation. */
    registryError: z.string().nullable(),
  })
  .strict()
export type ExtensionsDoctorRow = z.infer<typeof ExtensionsDoctorRow>
