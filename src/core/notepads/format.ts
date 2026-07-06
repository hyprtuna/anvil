import type { NotepadsEntry, NotepadsSection } from './types.js'

const SECTION_DISPLAY: Record<NotepadsSection, string> = {
  learnings: 'Learnings (recent)',
  decisions: 'Decisions (recent)',
  issues: 'Issues (active)',
  verification: 'Verification (latest)',
  problems: 'Problems (open)',
  'large-outputs': 'Large outputs (stashed)',
}

/**
 * Format a `recent-context.md` content string from a flat list of entries.
 *
 * The output is bounded to `maxChars`. Uses `chars/4` as a token estimate.
 * Format mirrors design spec §4.
 *
 * Layout:
 * ```
 * # Anvil notepad — branch:<slug> · last-touch:<ISO>
 *
 * ## Learnings (recent)
 * - YYYY-MM-DD [source] headline
 * ...
 *
 * ---
 * **Read full sections:** `anvil notepad read {learnings|...}`
 * ```
 */
export function formatRecentContext(
  entries: NotepadsEntry[],
  maxChars: number,
  branchSlug?: string,
): string {
  if (entries.length === 0) return ''

  const now = new Date().toISOString()
  const headerLine = `# Anvil notepad — branch:${branchSlug ?? 'unknown'} · last-touch:${now}`

  const sectionNames: NotepadsSection[] = [
    'learnings',
    'decisions',
    'issues',
    'verification',
    'problems',
    'large-outputs',
  ]

  // Group entries by section, sorted by timestamp descending (newest first)
  const bySection = new Map<NotepadsSection, NotepadsEntry[]>()
  for (const section of sectionNames) {
    bySection.set(section, [])
  }
  for (const e of entries) {
    bySection.get(e.section)?.push(e)
  }
  for (const [, arr] of bySection) {
    arr.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
  }

  const footer =
    '---\n**Read full sections:** `anvil notepad read {learnings|decisions|issues|verification|problems|large-outputs}`'

  // Build sections, cap to maxChars
  const blocks: string[] = [headerLine, '']
  let charCount = headerLine.length + 1

  for (const section of sectionNames) {
    const list = bySection.get(section) ?? []
    if (list.length === 0) continue

    const sectionHeader = `## ${SECTION_DISPLAY[section]}`
    const lines: string[] = []
    for (const e of list) {
      const date = e.timestamp.slice(0, 10)
      lines.push(`- ${date} [${e.source}] ${e.headline}`)
    }

    const block = [sectionHeader, ...lines, ''].join('\n')
    if (charCount + block.length > maxChars - footer.length - 4) {
      // Only add as many entries as fit
      const partial = [sectionHeader]
      for (const line of lines) {
        if (
          charCount + partial.join('\n').length + line.length >
          maxChars - footer.length - 10
        )
          break
        partial.push(line)
      }
      if (partial.length > 1) {
        blocks.push(partial.join('\n'))
        blocks.push('')
      }
      break
    }

    blocks.push(block)
    charCount += block.length
  }

  blocks.push(footer)
  return blocks.join('\n')
}

/**
 * Collapse entries older than `days` days into a stub "Compressed" entry.
 *
 * Returns the surviving entries (recent) plus one synthetic compressed entry
 * if there were any old entries.
 */
export function compressOlderThan(
  entries: NotepadsEntry[],
  days: number,
): NotepadsEntry[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const recent: NotepadsEntry[] = []
  const older: NotepadsEntry[] = []

  for (const e of entries) {
    const ts = new Date(e.timestamp).getTime()
    if (ts >= cutoff) {
      recent.push(e)
    } else {
      older.push(e)
    }
  }

  if (older.length === 0) return recent

  // Sort older by timestamp to find date range
  older.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
  const earliest = older[0].timestamp.slice(0, 10)
  const latest = older[older.length - 1].timestamp.slice(0, 10)

  // Group by section
  const bySec = new Map<NotepadsSection, number>()
  for (const e of older) {
    bySec.set(e.section, (bySec.get(e.section) ?? 0) + 1)
  }
  const counts = Array.from(bySec.entries())
    .map(([s, n]) => `${s}:${n}`)
    .join(', ')

  const stub: NotepadsEntry = {
    section: older[0].section,
    headline: `Compressed: ${older.length} entries (${earliest} to ${latest}) — ${counts}`,
    source: 'compact',
    timestamp: new Date().toISOString(),
  }

  return [...recent, stub]
}

/**
 * Format a single section file content from a list of entries.
 * Used by `appendEntry` to regenerate the file after compaction.
 */
export function formatSectionFile(
  entries: NotepadsEntry[],
  section: NotepadsSection,
  branchSlug: string,
): string {
  const lines = [`# ${section} — branch:${branchSlug}`, '']

  const active = entries.filter(
    (e) => e.source !== 'compact' || !e.headline.startsWith('Compressed:'),
  )
  const compressed = entries.filter(
    (e) => e.source === 'compact' && e.headline.startsWith('Compressed:'),
  )

  if (active.length > 0) {
    lines.push('## Active')
    for (const e of active) {
      const date = e.timestamp.slice(0, 10)
      lines.push(`### ${date} — ${e.headline} [${e.source}]`)
      if (e.body) {
        lines.push(e.body)
      }
      lines.push('')
    }
  }

  if (compressed.length > 0) {
    lines.push('---', '', '## Older entries — compressed')
    for (const e of compressed) {
      lines.push(`- ${e.timestamp.slice(0, 10)}: ${e.headline}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
