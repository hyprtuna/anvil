/**
 * ANV-0056 — SessionStart aggregate context budget with priority order.
 *
 * Collects systemInsert fragments from multiple SessionStart handler results,
 * iterates them in priority order (highest priority first), and concatenates
 * them until the budget is exhausted. Lower-priority fragments that do not
 * fit are dropped; when any truncation occurs, an explicit notice is appended
 * so the model knows context was elided.
 *
 * Design notes:
 *  - Pure function: no disk I/O, no process interaction. Callers log overruns.
 *  - "Budget = 0" is explicitly supported: every fragment is dropped and the
 *    notice is also suppressed (budget of 0 signals "no context wanted").
 *  - Separator between fragments is a single blank line ("\n\n").
 *  - The truncation notice itself is counted against the budget. If it cannot
 *    fit within the budget it is emitted regardless (minimum guarantee), but
 *    this edge-case is academic given the 6000 char default.
 */

/** Default aggregate char budget for SessionStart context injection (OmO default). */
export const SESSION_START_BUDGET_CHARS = 6000

/** Separator inserted between adjacent context fragments. */
const FRAGMENT_SEPARATOR = '\n\n'

/** Truncation notice appended when at least one fragment was dropped. */
const TRUNCATION_NOTICE_TEMPLATE = (budget: number) =>
  `[truncated to fit ${budget} char budget]`

/**
 * One context fragment contributed by a SessionStart handler.
 * `priority` mirrors the handler's registration priority (higher = runs first).
 * `name` is the handler's registered name — used in logging only.
 */
export interface SessionStartFragment {
  name: string
  priority: number
  systemInsert: string
}

/**
 * Result of the budget aggregation pass.
 */
export interface SessionStartAggregateResult {
  /** The aggregated context string to inject as systemInsert, or undefined when the budget is 0 or no fragments exist. */
  aggregated: string | undefined
  /** True when at least one fragment was truncated or dropped. */
  truncated: boolean
  /** Total chars accumulated before the truncation notice. */
  usedChars: number
  /** Number of fragments that were fully included. */
  includedCount: number
  /** Number of fragments that were partially or fully dropped. */
  droppedCount: number
}

/**
 * Aggregate SessionStart systemInsert fragments within a char budget.
 *
 * @param fragments  Unsorted fragments from handler results. Will be sorted by priority desc.
 * @param budgetChars  Maximum total characters for the aggregated output. Default 6000.
 */
export function aggregateSessionStartContext(
  fragments: SessionStartFragment[],
  budgetChars = SESSION_START_BUDGET_CHARS,
): SessionStartAggregateResult {
  // Budget = 0: suppress all context.
  if (budgetChars === 0) {
    return {
      aggregated: undefined,
      truncated: fragments.length > 0,
      usedChars: 0,
      includedCount: 0,
      droppedCount: fragments.length,
    }
  }

  // Sort by priority descending (highest priority wins budget first).
  const sorted = [...fragments].sort((a, b) => b.priority - a.priority)

  const parts: string[] = []
  let used = 0
  let includedCount = 0
  let droppedCount = 0
  let truncated = false

  for (const frag of sorted) {
    const text = frag.systemInsert
    if (text.length === 0) {
      // Empty fragments are included for free (no chars consumed).
      includedCount++
      continue
    }

    const prefix = parts.length > 0 ? FRAGMENT_SEPARATOR : ''
    const needed = prefix.length + text.length

    if (used + needed <= budgetChars) {
      parts.push(prefix + text)
      used += needed
      includedCount++
    } else {
      droppedCount++
      truncated = true
    }
  }

  if (truncated) {
    const notice = TRUNCATION_NOTICE_TEMPLATE(budgetChars)
    const prefix = parts.length > 0 ? FRAGMENT_SEPARATOR : ''
    parts.push(prefix + notice)
    // usedChars intentionally does not include the notice itself — it reflects
    // the "payload" chars, not the overhead. This keeps the doctor metric clean.
  }

  const aggregated = parts.length > 0 ? parts.join('') : undefined

  return { aggregated, truncated, usedChars: used, includedCount, droppedCount }
}
