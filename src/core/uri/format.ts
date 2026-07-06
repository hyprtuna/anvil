import { BUNDLED_PACK } from './filesystem-map.js'
import type { ResourceRef } from './types.js'

// ---------------------------------------------------------------------------
// ANV-0095 — anvil: URI formatters
// Pure: no I/O. Inverses of parseGrammar for the canonical kinded form.
// ---------------------------------------------------------------------------

/**
 * Render a `ResourceRef` as its canonical kinded URI string:
 *   `anvil:[<pack>:]<kind>/<slug>[/<version>][#<fragment>]`
 *
 * `pack === 'anvil'` is treated as the bundled sentinel and omitted from the
 * rendered output.
 */
export function canonicalise(ref: ResourceRef): string {
  const packPart = ref.pack && ref.pack !== BUNDLED_PACK ? `${ref.pack}:` : ''
  const versionPart = ref.version ? `/${ref.version}` : ''
  const fragmentPart = ref.fragment ? `#${ref.fragment}` : ''
  return `anvil:${packPart}${ref.kind}/${ref.slug}${versionPart}${fragmentPart}`
}

/**
 * Render a `ResourceRef` in ANV-0096 `<pack>:<slug>` shorthand for UX
 * surfaces. Bundled refs render as the bare slug.
 */
export function toShorthand(ref: ResourceRef): string {
  if (!ref.pack || ref.pack === BUNDLED_PACK) return ref.slug
  return `${ref.pack}:${ref.slug}`
}
