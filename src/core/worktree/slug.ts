/**
 * ANV-0155 — Slug derivation from ticket header.
 * Layer 0 — pure function, no I/O.
 *
 * Rules:
 *   - Input: "ANV-NNNN — <title>" (em-dash or ASCII —)
 *   - Strip the "ANV-NNNN — " prefix, keep the ticket id as prefix in slug
 *   - Lowercase, replace whitespace/punctuation with -, dedupe consecutive -
 *   - Max 50 chars, trim trailing -
 *   - Throw on empty result or missing ANV-NNNN prefix
 *
 * Example: "ANV-0157 — Fix install-scope detection"
 *       → "anv-0157-fix-install-scope-detection"
 */

const ANV_ID_RE = /^(ANV-\d{4})\s*[—\-–]\s*/i

/**
 * Normalise a single character: return the ASCII equivalent or '-' for
 * whitespace/punctuation, '' to drop (e.g. combining diacritics).
 */
function normaliseChar(ch: string): string {
  // Keep alphanumeric ASCII
  if (/[a-z0-9]/.test(ch)) return ch
  // Replace whitespace and common punctuation with separator
  if (/[\s.,;:!?()[\]{}<>'"@#$%^&*+=|\\/_~`]/.test(ch)) return '-'
  // em-dash, en-dash, hyphen variants
  if (/[-—–‐‑‒–—]/.test(ch)) return '-'
  // Everything else: drop it (covers remaining Unicode after NFKD)
  return ''
}

export function deriveSlug(header: string): string {
  // Validate ANV-NNNN prefix
  const match = ANV_ID_RE.exec(header)
  if (!match) {
    throw new Error(
      `deriveSlug: header must start with ANV-NNNN pattern; got: ${JSON.stringify(header)}`,
    )
  }

  const ticketId = (match[1] ?? '').toLowerCase() // e.g. "anv-0157"
  // Everything after the prefix is the title
  const title = header.slice(match[0].length)

  // NFKD decomposition + ASCII filter for the title
  const normalized = title.normalize('NFKD')

  // Build slug: ticketId + '-' + slugified title
  let slugParts = `${ticketId}-`
  for (const ch of normalized.toLowerCase()) {
    slugParts += normaliseChar(ch)
  }

  // Dedupe consecutive dashes
  slugParts = slugParts.replace(/-{2,}/g, '-')
  // Trim trailing dashes
  slugParts = slugParts.replace(/-+$/, '')
  // Trim leading dashes (shouldn't happen but be safe)
  slugParts = slugParts.replace(/^-+/, '')

  if (!slugParts || slugParts === ticketId) {
    throw new Error(
      `deriveSlug: slug derivation produced empty result from: ${JSON.stringify(header)}`,
    )
  }

  // Enforce max 50 chars — truncate at a dash boundary
  if (slugParts.length > 50) {
    slugParts = slugParts.slice(0, 50).replace(/-[^-]*$/, '')
    // If truncation removed everything after ticketId, just use ticketId
    if (!slugParts || slugParts === ticketId.slice(0, 50)) {
      slugParts = ticketId
    }
  }

  return slugParts
}
