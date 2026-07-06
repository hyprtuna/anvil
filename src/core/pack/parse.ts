/**
 * ANV-0096 — Parser for `<pack>:<slug>` namespace syntax.
 *
 * Grammar:
 *   ref     = bare-slug / pack-slug
 *   pack-slug = pack ":" slug
 *   pack    = [a-z0-9-]+
 *   slug    = [a-z0-9]([a-z0-9-]*[a-z0-9])?
 *
 * Pure. No I/O. Returns `null` on rejection.
 */

import type { ParsedPackSlug } from './types.js'

const PACK_RE = /^[a-z0-9-]+$/
const SLUG_RE = /^(?:[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])$/

/** Maximum reasonable length cap for a `<pack>:<slug>` input (DoS guard). */
export const MAX_PACK_SLUG_LENGTH = 128

/**
 * Parse `<pack>:<slug>` or bare `<slug>`. Returns `null` for malformed input:
 *   - empty string
 *   - more than one `:` (e.g. `a:b:c`)
 *   - empty pack (`:slug`) or empty slug (`pack:`)
 *   - pack or slug failing the lowercase grammar
 */
export function parsePackSlug(input: string): ParsedPackSlug | null {
  if (typeof input !== 'string') return null
  if (input.length === 0 || input.length > MAX_PACK_SLUG_LENGTH) return null

  // Reject if more than one colon.
  const firstColon = input.indexOf(':')
  if (firstColon === -1) {
    // Bare slug.
    return SLUG_RE.test(input) ? { pack: null, slug: input } : null
  }
  const lastColon = input.lastIndexOf(':')
  if (firstColon !== lastColon) return null

  const pack = input.slice(0, firstColon)
  const slug = input.slice(firstColon + 1)
  if (pack.length === 0 || slug.length === 0) return null
  if (!PACK_RE.test(pack)) return null
  if (!SLUG_RE.test(slug)) return null
  return { pack, slug }
}
