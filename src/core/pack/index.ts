/**
 * ANV-0096 — `<pack>:<slug>` namespace barrel.
 *
 * Layer-0 public API for the pack resolver. Higher layers import from here.
 */

export { parsePackSlug, MAX_PACK_SLUG_LENGTH } from './parse.js'
export { resolvePackSlug, BUNDLED_PACK } from './resolve.js'
export {
  PackName,
  PackSource,
  Slug,
} from './types.js'
export type {
  PackCollisionInfo,
  PackResolution,
  PackResolutionMatch,
  PackResolveContext,
  PackResolveRoots,
  ParsedPackSlug,
} from './types.js'
