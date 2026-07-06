import type { HookHandler } from '../../core/types.js'

/**
 * Tracks file read counts per session to warn when approaching context limits.
 * Advisory only — warns but never blocks (exitCode 0 or 1, never 2).
 * Disabled by default — opt in via config.
 */

// Module-level counter tracking reads per session
const readCounts = new Map<string, number>()
let totalReads = 0
const WARN_THRESHOLD = 50 // warn at 50 reads
const CRITICAL_THRESHOLD = 100 // critical at 100 reads

/** Reset counters — exposed for testing */
export function resetReadCounts(): void {
  readCounts.clear()
  totalReads = 0
}

/** Get current total reads — exposed for testing */
export function getTotalReads(): number {
  return totalReads
}

export const readGuardHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as {
    filePath?: string
  } | null

  const filePath = payload?.filePath ?? ''

  if (!filePath) {
    return { exitCode: 0, message: 'read-guard: no file path provided' }
  }

  // Increment counters
  const prev = readCounts.get(filePath) ?? 0
  readCounts.set(filePath, prev + 1)
  totalReads++

  // Build top-files list (top 5 most-read files)
  const topFiles = [...readCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => ({ path, count }))

  if (totalReads >= CRITICAL_THRESHOLD) {
    return {
      exitCode: 1,
      message: `read-guard: CRITICAL — ${totalReads} file reads this session (threshold: ${CRITICAL_THRESHOLD}). Context window pressure is high. Consider summarising or resetting context.`,
      context: { totalReads, topFiles, severity: 'critical' },
    }
  }

  if (totalReads >= WARN_THRESHOLD) {
    return {
      exitCode: 1,
      message: `read-guard: WARNING — ${totalReads} file reads this session (threshold: ${WARN_THRESHOLD}). Monitor context window usage.`,
      context: { totalReads, topFiles, severity: 'warning' },
    }
  }

  return {
    exitCode: 0,
    message: `read-guard: ${filePath} — read #${totalReads}`,
    context: { totalReads, topFiles, severity: 'ok' },
  }
}
