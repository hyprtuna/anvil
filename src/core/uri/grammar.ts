import { ResourceKind } from './types.js'
import type { ParsedUri } from './types.js'

// ---------------------------------------------------------------------------
// ANV-0095 — anvil: URI grammar parser
// Pure: no I/O, no side effects.
// Grammar (RFC §2.1):
//   anvil-uri = "anvil:" [ pack ":" ] kind "/" slug [ "/" version ] [ "#" fragment ]
// ---------------------------------------------------------------------------

/** Hard length cap (RFC §6.4) — pre-grammar DoS guard. */
export const MAX_URI_LENGTH = 512

/**
 * Anchored regex equivalent of the ABNF in RFC §2.1.
 *
 * Capture groups:
 *   1: pack    (optional, `[a-z0-9-]+`)
 *   2: kind    (skill|agent|hook|command|slash|plan|ticket)
 *   3: slug    (`[a-z0-9][a-z0-9-]*[a-z0-9]` or single `[a-z0-9]`)
 *               OR the ANV-NNNN ticket form
 *               OR a semver-versioned plan slug (`v1.2.3[-suffix]`)
 *   4: version (optional, semver-ish `v\d+\.\d+\.\d+(-suffix)?`)
 *   5: fragment (optional, any non-empty)
 *
 * The slug regex is permissive enough to accept three call shapes:
 *   - normal slugs: `code-review`, `ultra-worker`
 *   - ticket slugs: `ANV-0095` (the ticket kind permits uppercase ANV prefix
 *     because the on-disk filename is the canonical surface)
 *   - plan slugs:   `v0.15.6` (versions used as slugs, RFC §2.2)
 */
const SLUG =
  '(?:[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9]|ANV-\\d{4}|v\\d+\\.\\d+\\.\\d+(?:-[A-Za-z0-9.+-]+)?)'
const PACK = '[a-z0-9-]+'
const KIND = '(?:skill|agent|hook|command|slash|plan|ticket)'
const VERSION = 'v\\d+\\.\\d+\\.\\d+(?:-[A-Za-z0-9.+-]+)?'

const CANONICAL_RE = new RegExp(
  `^anvil:(?:(${PACK}):)?(${KIND})/(${SLUG})(?:/(${VERSION}))?(?:#(.+))?$`,
)

/**
 * Shorthand form: `anvil:<slug>` with no kind segment. This exists so legacy
 * invocations (e.g. `Skill({skill: "anvil:code-review"})`) continue to work
 * with an inferred kind supplied by the caller's invocation context.
 *
 * Per RFC §2.3 only the bare slug pattern is accepted as shorthand — no pack,
 * no version, no fragment. Pack/version/fragment require the kinded form.
 */
const SHORTHAND_SLUG = '(?:[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])'
const SHORTHAND_RE = new RegExp(`^anvil:(${SHORTHAND_SLUG})$`)

const LOWERCASE_SLUG_RE = /^(?:[a-z0-9][a-z0-9-]*[a-z0-9]|[a-z0-9])$/
const TICKET_SLUG_RE = /^ANV-\d{4}$/
const PLAN_SLUG_RE = /^v\d+\.\d+\.\d+(?:-[A-Za-z0-9.+-]+)?$/

/**
 * Per-kind slug shape validation. The canonical regex is intentionally
 * permissive (so the parser is a single regex); this function tightens it.
 */
function slugValidForKind(
  kind: import('./types.js').ResourceKind,
  slug: string,
): boolean {
  if (kind === 'ticket') return TICKET_SLUG_RE.test(slug)
  if (kind === 'plan') return PLAN_SLUG_RE.test(slug)
  return LOWERCASE_SLUG_RE.test(slug)
}

/**
 * Parse an `anvil:` URI into its components. Returns `null` if the input is
 * not an `anvil:` URI or fails the grammar.
 *
 * This function is pure and does no filesystem access — it only validates
 * structure. `kind` will be `undefined` for valid shorthand inputs; the
 * resolver substitutes the inferred kind from invocation context.
 */
export function parseGrammar(uri: string): ParsedUri | null {
  if (typeof uri !== 'string') return null
  if (uri.length === 0 || uri.length > MAX_URI_LENGTH) return null
  if (!uri.startsWith('anvil:')) return null

  const canonical = CANONICAL_RE.exec(uri)
  if (canonical) {
    const [, pack, kindRaw, slug, version, fragment] = canonical
    const kindParse = ResourceKind.safeParse(kindRaw)
    if (!kindParse.success) return null
    const kind = kindParse.data
    if (!slugValidForKind(kind, slug)) return null
    const parsed: ParsedUri = {
      kind,
      slug,
    }
    if (pack !== undefined) parsed.pack = pack
    if (version !== undefined) parsed.version = version
    if (fragment !== undefined) parsed.fragment = fragment
    return parsed
  }

  const shorthand = SHORTHAND_RE.exec(uri)
  if (shorthand) {
    const [, slug] = shorthand
    return { slug }
  }

  return null
}
