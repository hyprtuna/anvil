/**
 * ANV-0215 Gate-1 — Shared Levenshtein util.
 *
 * Extracted from the inline copies in `types.ts` (findNearestEnum) and
 * `models/resolve.ts` (findNearestTier) so both consumers share one
 * implementation. Leaf module: no imports from other src/ layers.
 */

/** Levenshtein edit distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

/**
 * Returns the closest match from `values` if the edit distance is
 * ≤ half the input length (a "reasonable typo"), otherwise undefined.
 */
export function findNearest(
  input: string,
  values: readonly string[],
): string | undefined {
  if (values.length === 0) return undefined
  let best: string | undefined
  let bestDist = Number.POSITIVE_INFINITY
  for (const v of values) {
    const d = levenshtein(input, v)
    if (d < bestDist) {
      bestDist = d
      best = v
    }
  }
  return bestDist <= Math.ceil(input.length / 2) ? best : undefined
}
