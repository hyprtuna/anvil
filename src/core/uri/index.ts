// ANV-0095 — anvil: URI scheme barrel.
// Public API for the layer-0 URI resolver. Higher layers import from here.

export { parseGrammar, MAX_URI_LENGTH } from './grammar.js'
export { resolveAnvilUri } from './resolve.js'
export { canonicalise, toShorthand } from './format.js'
export { filesystemMap, BUNDLED_PACK } from './filesystem-map.js'
export type { FsCandidate } from './filesystem-map.js'
export {
  ResourceKind,
  AnvilUriErrorCode,
} from './types.js'
export type {
  AnvilUriError,
  ParsedUri,
  ResolveContext,
  ResolveResult,
  ResolveRoots,
  ResourceRef,
} from './types.js'
