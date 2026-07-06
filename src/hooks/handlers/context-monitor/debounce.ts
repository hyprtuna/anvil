/**
 * Bridge-write debounce for context-monitor (Plan 43 Phase H).
 *
 * Module-level state map keyed by session id; survives across hook calls in a
 * single process. Bridge writes only fire when the utilization ratio moves
 * by ≥5% OR the tool-call count grows by ≥5 since the last write.
 */

const RATIO_DELTA_THRESHOLD = 0.05 // 5%
const TOOL_CALL_DEBOUNCE = 5

const debounceState = new Map<
  string,
  { lastRatio: number; lastToolCallCount: number }
>()

export function shouldWriteBridge(
  sessionId: string,
  ratio: number,
  toolCallCount: number,
): boolean {
  const state = debounceState.get(sessionId)
  if (!state) return true // first call

  const ratioDelta = Math.abs(ratio - state.lastRatio)
  const toolCallDelta = toolCallCount - state.lastToolCallCount
  return (
    ratioDelta >= RATIO_DELTA_THRESHOLD || toolCallDelta >= TOOL_CALL_DEBOUNCE
  )
}

export function updateDebounceState(
  sessionId: string,
  ratio: number,
  toolCallCount: number,
): void {
  debounceState.set(sessionId, {
    lastRatio: ratio,
    lastToolCallCount: toolCallCount,
  })
}

/** Exposed for tests — clears the in-process debounce state. */
export function resetDebounceState(): void {
  debounceState.clear()
}
