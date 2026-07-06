/**
 * Minimal LCS-based unified diff renderer.
 * Pure, synchronous — no I/O, no external deps.
 */

/**
 * Compute LCS length table for two line arrays.
 * Returns the DP table (rows = oldLines length+1, cols = newLines length+1).
 */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  return dp
}

/**
 * Renders a minimal unified diff between two strings.
 * Returns an array of lines each prefixed with '+', '-', or ' '.
 */
export function diffLines(oldContent: string, newContent: string): string[] {
  const a = oldContent === '' ? [] : oldContent.split('\n')
  const b = newContent === '' ? [] : newContent.split('\n')

  // Strip trailing empty string caused by trailing newline
  if (a.length > 0 && a[a.length - 1] === '') a.pop()
  if (b.length > 0 && b[b.length - 1] === '') b.pop()

  const dp = lcsTable(a, b)
  const result: string[] = []

  let i = a.length
  let j = b.length
  const backtrack: Array<[number, number]> = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      backtrack.push([0, i - 1]) // context
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      backtrack.push([1, j - 1]) // added
      j--
    } else {
      backtrack.push([-1, i - 1]) // removed
      i--
    }
  }

  backtrack.reverse()
  for (const [type, idx] of backtrack) {
    if (type === 0) result.push(` ${a[idx]}`)
    else if (type === 1) result.push(`+${b[idx]}`)
    else result.push(`-${a[idx]}`)
  }

  return result
}

/**
 * Formats the diff as a unified diff block for a single file.
 * Returns empty string if old and new are identical.
 */
export function formatFileDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
): string {
  if (oldContent === newContent) return ''

  const lines = diffLines(oldContent, newContent)

  const oldLines = oldContent === '' ? [] : oldContent.split('\n')
  const newLines = newContent === '' ? [] : newContent.split('\n')
  if (oldLines.length > 0 && oldLines[oldLines.length - 1] === '')
    oldLines.pop()
  if (newLines.length > 0 && newLines[newLines.length - 1] === '')
    newLines.pop()

  // POSIX unified diff: a zero-line side uses start-line 0, not 1
  const oldStart = oldLines.length === 0 ? 0 : 1
  const newStart = newLines.length === 0 ? 0 : 1

  const header = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -${oldStart},${oldLines.length} +${newStart},${newLines.length} @@`,
  ]

  return `${[...header, ...lines].join('\n')}\n`
}
