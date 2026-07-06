/**
 * Parsed sections from a release slate markdown doc.
 * Each field holds the trimmed body text of the named section
 * (everything between the section heading and the next heading).
 */
export interface SlateSections {
  added?: string
  improved?: string
  changed?: string
  fixed?: string
  deferred?: string
}

/**
 * Extract the content of `### Added`, `### Improved`, `### Changed`,
 * `### Fixed`, and `### Deferred` sections from a release slate markdown doc.
 *
 * The match is case-insensitive and handles the section heading variants
 * used in Anvil's slate format, e.g. "### Added — 3 (agent ergonomics)".
 * Only the first word after "###" is matched; the rest of the heading line
 * (counts, parenthetical notes) is ignored.
 *
 * Returns an object with only the keys that were actually found.
 *
 * @param slateMarkdown - raw markdown string of the slate doc
 */
export function parseSlateSections(slateMarkdown: string): SlateSections {
  const result: SlateSections = {}

  const sectionKeys = [
    'added',
    'improved',
    'changed',
    'fixed',
    'deferred',
  ] as const

  // Split on any ### heading to find section boundaries.
  // We capture the heading line and the body that follows.
  const headingRegex = /^###\s+(\w+)[^\n]*/gim
  const headings: Array<{ key: string; start: number; end: number }> = []

  for (const match of slateMarkdown.matchAll(headingRegex)) {
    headings.push({
      key: (match[1] ?? '').toLowerCase(),
      start: match.index + match[0].length,
      end: slateMarkdown.length, // will be trimmed by next heading
    })
    if (headings.length > 1) {
      const prev = headings[headings.length - 2]
      if (prev !== undefined) {
        prev.end = match.index
      }
    }
  }

  for (const h of headings) {
    const key = h.key as (typeof sectionKeys)[number]
    if (sectionKeys.includes(key)) {
      const body = slateMarkdown.slice(h.start, h.end).trim()
      if (body.length > 0) {
        result[key] = body
      }
    }
  }

  return result
}
