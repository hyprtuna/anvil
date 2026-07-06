/**
 * ANV-0027 — Public API barrel for the extension library.
 *
 * Library-only (no CLI surface in v0.15.6). Install UX, doctor row, and
 * interactive collision resolution land in v0.15.7 as ANV-0203.
 */

export { parseManifest } from './manifest.js'
export { safeExtract } from './extractor.js'
export { detectCollisions } from './collisions.js'
export {
  AnvilUriString,
  EXTRACT_MAX_BYTES,
  EXTRACT_MAX_ENTRIES,
  ExtensionCompatibility,
  ExtensionKind,
  ExtensionManifest,
  ExtensionProvides,
  ExtensionResourceKind,
  SemverString,
} from './types.js'
export type {
  Collision,
  CollisionContext,
  CollisionTier,
  ExtractError,
  ExtractErrorCode,
  ManifestError,
  Result,
} from './types.js'
