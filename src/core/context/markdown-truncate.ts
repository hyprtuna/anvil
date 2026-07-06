/**
 * markdown-truncate.ts — pure markdown-aware truncation primitives (ANV-0019).
 *
 * Preserves structural elements in order of priority:
 *   1. YAML frontmatter block (--- ... ---)
 *   2. ATX headings (# / ## / ### …)
 *   3. Checklist items (- [ ] / - [x])
 *   4. Fenced code blocks (``` …  ``` and ~~~ … ~~~) — never split mid-fence
 *
 * Cutting heuristics (in order of preference):
 *   - cut at section boundaries (blank line before a heading)
 *   - cut at fence boundaries (never inside a ```fenced``` block)
 *   - cut at last newline within the byte budget
 *   - avoid orphaning a heading at the tail of the kept body
 *
 * Layer 0 — no imports from src/; pure functions only.
 */

/**
 * Result of a truncation pass.
 */
export interface TruncateResult {
  /** Truncated (or unchanged) text. */
  text: string
  /** Whether truncation was applied. */
  truncated: boolean
}

/**
 * Extract the YAML frontmatter block from a markdown string.
 * Returns the block (including delimiters) and the rest of the content.
 */
function splitFrontmatter(content: string): {
  frontmatter: string
  body: string
} {
  if (!content.startsWith('---')) {
    return { frontmatter: '', body: content }
  }
  const end = content.indexOf('\n---', 3)
  if (end === -1) {
    return { frontmatter: '', body: content }
  }
  // Include the closing --- line (up to and including the newline after it)
  const closeEnd = content.indexOf('\n', end + 1)
  const frontmatter =
    closeEnd === -1 ? content.slice(0, end + 4) : content.slice(0, closeEnd + 1)
  const body = closeEnd === -1 ? '' : content.slice(closeEnd + 1)
  return { frontmatter, body }
}

/**
 * Extract all ATX headings from a markdown body.
 * Returns heading lines in document order.
 */
function extractHeadings(body: string): string[] {
  return body.split('\n').filter((line) => /^#{1,6}\s/.test(line))
}

/**
 * Extract all checklist items from a markdown body.
 * Returns lines matching `- [ ]` or `- [x]` (case-insensitive x).
 */
function extractChecklists(body: string): string[] {
  return body.split('\n').filter((line) => /^(\s*)-\s+\[[ xX]\]/.test(line))
}

/**
 * Returns the byte offset of the last fence-safe / section-safe cut point at
 * or before `limit` in `text`.
 *
 * Rules:
 *   1. Never cut inside a fenced code block (``` … ``` or ~~~ … ~~~).
 *      If `limit` lands inside an unclosed fence, walk back to the line
 *      before the opening fence.
 *   2. Prefer a section boundary (blank line before a heading) when one
 *      exists within the last 25% of the budget.
 *   3. Avoid orphaning a heading on the final line of the kept body — if
 *      the kept body would end with an ATX heading, walk back to the
 *      preceding newline.
 *   4. Fall back to the last newline at or before `limit`.
 *   5. Final fallback: the full `limit` itself (no newline found).
 */
export function findSafeCut(text: string, limit: number): number {
  if (limit <= 0) return 0
  if (limit >= text.length) return text.length

  // Walk lines from start to track fence depth; remember the last "safe"
  // offset (end of a line outside any open fence). Stop once we pass limit.
  const FENCE_RE = /^(```|~~~)/
  const HEADING_RE = /^#{1,6}\s/
  let inFence = false
  let lastSafeNewline = 0
  let lastSectionBoundary = -1
  let prevLineWasBlank = false
  let offset = 0
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const lineLen = line.length + 1 // +1 for the '\n' we split on
    const lineEnd = offset + lineLen
    // Toggle fence state at fence-marker lines.
    if (FENCE_RE.test(line)) {
      inFence = !inFence
    }
    if (lineEnd > limit) break
    if (!inFence) {
      lastSafeNewline = lineEnd
      // Section boundary: blank line followed by a heading.
      if (prevLineWasBlank && HEADING_RE.test(line)) {
        lastSectionBoundary = offset // start of the heading line
      }
    }
    prevLineWasBlank = line.trim().length === 0
    offset = lineEnd
  }

  // Prefer a section boundary in the last 25% of the budget.
  if (
    lastSectionBoundary > 0 &&
    lastSectionBoundary >= Math.floor(limit * 0.75)
  ) {
    return lastSectionBoundary
  }

  // Avoid orphaning a heading at the tail of the kept body.
  if (lastSafeNewline > 0) {
    const kept = text.slice(0, lastSafeNewline)
    const tailLines = kept.split('\n')
    // The last element is empty (trailing newline); the line before is the
    // last content line.
    const lastLine = tailLines[tailLines.length - 2] ?? ''
    if (HEADING_RE.test(lastLine)) {
      const prevNl = kept.lastIndexOf('\n', lastSafeNewline - 2)
      if (prevNl > 0) return prevNl + 1
    }
    return lastSafeNewline
  }

  return limit
}

/**
 * Truncate `content` to `maxChars` while preserving structural elements.
 *
 * Strategy:
 *   1. Always keep the full frontmatter block (if present).
 *   2. Fill remaining budget with body text (raw slice at last newline boundary).
 *   3. If headings or checklists were cut, append a compact skeleton of the
 *      missing structural elements after the truncation notice.
 *   4. Append a truncation notice line.
 *
 * When `content.length <= maxChars`, returns the content unchanged.
 */
export function truncateMarkdown(
  content: string,
  maxChars: number,
): TruncateResult {
  if (content.length <= maxChars) {
    return { text: content, truncated: false }
  }

  const { frontmatter, body } = splitFrontmatter(content)

  // If frontmatter alone exceeds maxChars, truncate frontmatter and return early.
  if (frontmatter.length >= maxChars) {
    const TRUNC_MARKER = '\n> [truncated]'
    const markerLen = TRUNC_MARKER.length
    const room = maxChars - markerLen
    const truncatedFm =
      room > 0
        ? frontmatter.slice(0, room) + TRUNC_MARKER
        : frontmatter.slice(0, maxChars)
    return { text: truncatedFm, truncated: true }
  }

  const NOTICE = '\n\n> [truncated — remaining headings/checklists below]\n'

  // Build the full skeleton from all structural elements in the body, so we know
  // its actual length before computing the body budget.
  const fullHeadings = extractHeadings(body)
  const fullChecklists = extractChecklists(body)

  const skeletonParts: string[] = []
  if (fullHeadings.length > 0) {
    skeletonParts.push(fullHeadings.join('\n'))
  }
  if (fullChecklists.length > 0) {
    skeletonParts.push(fullChecklists.join('\n'))
  }
  const fullSkeleton =
    skeletonParts.length > 0 ? `\n${skeletonParts.join('\n')}` : ''

  // Reserve space for the notice + skeleton so the final result fits in maxChars.
  const reservedChars = NOTICE.length + fullSkeleton.length
  const bodyBudget = maxChars - frontmatter.length - reservedChars

  let keptBody = ''
  if (bodyBudget > 0) {
    const cutAt = findSafeCut(body, bodyBudget)
    keptBody = body.slice(0, cutAt)
    // Strip a trailing newline so the NOTICE sits flush.
    if (keptBody.endsWith('\n')) keptBody = keptBody.slice(0, -1)
  }

  // Only include in the skeleton the structural items not already in keptBody.
  const keptHeadings = extractHeadings(keptBody)
  const keptChecklists = extractChecklists(keptBody)

  const missingHeadings = fullHeadings.filter((h) => !keptHeadings.includes(h))
  const missingChecklists = fullChecklists.filter(
    (c) => !keptChecklists.includes(c),
  )

  const missingParts: string[] = []
  if (missingHeadings.length > 0) {
    missingParts.push(missingHeadings.join('\n'))
  }
  if (missingChecklists.length > 0) {
    missingParts.push(missingChecklists.join('\n'))
  }
  const skeleton = missingParts.length > 0 ? `\n${missingParts.join('\n')}` : ''

  const assembled = `${frontmatter}${keptBody}${NOTICE}${skeleton}`

  // Final safety clamp: ensure result never exceeds maxChars regardless of edge cases.
  if (assembled.length > maxChars) {
    return { text: assembled.slice(0, maxChars), truncated: true }
  }

  return { text: assembled, truncated: true }
}
