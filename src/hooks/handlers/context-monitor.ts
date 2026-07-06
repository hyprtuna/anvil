/**
 * context-monitor handler — refactored Plan 43 Phase H.
 *
 * Monitors approximate context window usage on every post-tool-use event and
 * injects advisory warnings when remaining context is low:
 *   - 65% used → advisory warning (suggest compacting soon)
 *   - 80% used → critical warning (compact now or checkpoint)
 *
 * Plan 36 Phase G — agent context-bridge:
 *   - Writes /tmp/claude-ctx-<session_id>.json on utilization changes
 *     (5% delta, debounced to every 5 tool calls).
 *   - Reads the bridge file and emits a systemInsert warning when status
 *     is 'good→degrading' (≥65%) or 'POOR' (≥80%).
 *
 * Helpers live under `./context-monitor/`:
 *   bridge.ts   — ContextBridgeData, computeStatus, read/write bridge file
 *   debounce.ts — shouldWriteBridge, updateDebounceState (5%/5-call gate)
 *
 * Never blocks. Advisory only — exits 0 (OK) or 1 (warn).
 */

import type { HookHandler } from '../../core/types.js'
import { createSystemDirective } from '../system-directive.js'
import { readBridgeFile, writeBridgeFile } from './context-monitor/bridge.js'
import {
  shouldWriteBridge,
  updateDebounceState,
} from './context-monitor/debounce.js'

export {
  type ContextBridgeData,
  computeStatus,
  contextBridgeFilePath,
  readBridgeFile,
  writeBridgeFile,
} from './context-monitor/bridge.js'

export const contextMonitorHandler: HookHandler = async (ctx) => {
  const payload = ctx.payload as {
    tool?: string
    toolCallCount?: number
    contextTokens?: number
    contextLimit?: number
    session_id?: string
  } | null

  const toolCallCount = payload?.toolCallCount ?? 0
  const contextTokens = payload?.contextTokens ?? 0
  const contextLimit = payload?.contextLimit ?? 200_000
  const sessionId = payload?.session_id

  if (contextTokens === 0) {
    return { exitCode: 0, message: 'context-monitor: no usage data available' }
  }

  const ratio = contextTokens / contextLimit
  const usagePercent = Math.round(ratio * 100)

  // Bridge write: update bridge file on meaningful utilization change.
  if (sessionId !== undefined && sessionId.length > 0) {
    if (shouldWriteBridge(sessionId, ratio, toolCallCount)) {
      writeBridgeFile(sessionId, contextTokens, contextLimit)
      updateDebounceState(sessionId, ratio, toolCallCount)
    }
  }

  // Bridge read: inject systemInsert when bridge shows degraded status.
  let systemInsert: string | undefined
  if (sessionId !== undefined && sessionId.length > 0) {
    const bridge = readBridgeFile(sessionId)
    if (
      bridge !== null &&
      (bridge.status === 'good→degrading' || bridge.status === 'POOR')
    ) {
      const remainingPct = Math.round((1 - bridge.ratio) * 100)
      const body = `▶ Context budget: ${Math.round(bridge.ratio * 100)}% used (${remainingPct}% remaining); consider /compact or wrapping up.`
      systemInsert = createSystemDirective('CONTEXT_WINDOW_MONITOR', body)
    }
  }

  if (usagePercent >= 80) {
    return {
      exitCode: 1,
      message: [
        `context-monitor: CRITICAL — ${usagePercent}% context used (${contextTokens}/${contextLimit} tokens).`,
        'Compact the conversation now or save a checkpoint before continuing.',
        'Risk: quality degradation and potential context overflow.',
      ].join(' '),
      ...(systemInsert ? { systemInsert } : {}),
      context: {
        usagePercent,
        contextTokens,
        contextLimit,
        severity: 'critical',
        toolCallCount,
      },
    }
  }

  if (usagePercent >= 65) {
    return {
      exitCode: 1,
      message: [
        `context-monitor: WARNING — ${usagePercent}% context used (${contextTokens}/${contextLimit} tokens).`,
        'Consider compacting or summarizing completed work soon.',
      ].join(' '),
      ...(systemInsert ? { systemInsert } : {}),
      context: {
        usagePercent,
        contextTokens,
        contextLimit,
        severity: 'warning',
        toolCallCount,
      },
    }
  }

  return {
    exitCode: 0,
    message: `context-monitor: OK — ${usagePercent}% context used`,
    ...(systemInsert ? { systemInsert } : {}),
    context: {
      usagePercent,
      contextTokens,
      contextLimit,
      severity: 'ok',
      toolCallCount,
    },
  }
}
