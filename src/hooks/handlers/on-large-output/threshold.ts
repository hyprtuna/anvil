/**
 * Threshold + content-shape helpers for on-large-output (Plan 43 Phase E).
 *
 * Pure: word counting, token estimation, diff detection, diffstat rendering.
 * No I/O, no subprocess.
 */

/**
 * Count words via split-on-whitespace heuristic.
 * Fast and allocation-cheap — avoids regex at high frequency.
 */
export function countWords(text: string): number {
  let count = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    const isWS =
      c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11
    if (isWS) {
      if (inWord) {
        count++
        inWord = false
      }
    } else {
      inWord = true
    }
  }
  if (inWord) count++
  return count
}

/** Rough token estimate: 1 token ≈ 4 chars (conservative). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Detect whether a string looks like a unified diff. */
export function looksLikeDiff(text: string): boolean {
  const firstLine = text.slice(0, 200)
  return (
    firstLine.startsWith('diff --git') ||
    firstLine.startsWith('--- ') ||
    text.includes('\n@@')
  )
}

/**
 * Produce a diffstat-style summary from unified diff text.
 * Format: `<file> | +N -M (k hunks)` per file, plus a totals line.
 */
export function diffstatSummary(diff: string): string {
  const filePattern = /^diff --git a\/.+ b\/(.+)$/m
  const hunkPattern = /^@@ .+ @@/gm
  const addPattern = /^\+(?!\+\+)/gm
  const delPattern = /^-(?!--)/gm

  const blocks = diff.split(/^(?=diff --git )/m).filter(Boolean)
  const lines: string[] = []
  let totalAdded = 0
  let totalDeleted = 0

  for (const block of blocks) {
    const fileMatch = filePattern.exec(block)
    const fileName = fileMatch ? fileMatch[1] : '(unknown file)'
    const added = (block.match(addPattern) ?? []).length
    const deleted = (block.match(delPattern) ?? []).length
    const hunkCount = (block.match(hunkPattern) ?? []).length
    totalAdded += added
    totalDeleted += deleted
    if (added > 0 || deleted > 0) {
      lines.push(
        `${fileName} | +${added} -${deleted} (${hunkCount} hunk${hunkCount !== 1 ? 's' : ''})`,
      )
    }
  }

  const fileCount =
    blocks.filter((b) => filePattern.test(b)).length || blocks.length
  lines.push(
    `${fileCount} file${fileCount !== 1 ? 's' : ''} changed, ${totalAdded} insertion${totalAdded !== 1 ? 's' : ''}(+), ${totalDeleted} deletion${totalDeleted !== 1 ? 's' : ''}(-)`,
  )
  return lines.join('\n')
}
