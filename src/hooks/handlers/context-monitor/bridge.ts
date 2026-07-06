/**
 * Context-bridge file I/O for context-monitor (Plan 43 Phase H).
 *
 * Writes a small JSON record to `os.tmpdir()/claude-ctx-<session_id>.json`
 * with current context utilization. PostToolUse reads it to inject a
 * systemInsert warning when status crosses the 65% / 80% thresholds.
 *
 * Best-effort I/O — never throws; never blocks the handler.
 */

import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { safeWrite } from '../../../core/io/safe-write.js'

export interface ContextBridgeData {
  session_id: string
  used_tokens: number
  total_tokens: number
  ratio: number
  status: 'ok' | 'good→degrading' | 'POOR'
  timestamp: string
}

/** Absolute path to the bridge file for a given session. */
export function contextBridgeFilePath(sessionId: string): string {
  return join(tmpdir(), `claude-ctx-${sessionId}.json`)
}

export function computeStatus(ratio: number): ContextBridgeData['status'] {
  if (ratio >= 0.8) return 'POOR'
  if (ratio >= 0.65) return 'good→degrading'
  return 'ok'
}

export function writeBridgeFile(
  sessionId: string,
  usedTokens: number,
  totalTokens: number,
): void {
  try {
    const ratio = totalTokens > 0 ? usedTokens / totalTokens : 0
    const data: ContextBridgeData = {
      session_id: sessionId,
      used_tokens: usedTokens,
      total_tokens: totalTokens,
      ratio,
      status: computeStatus(ratio),
      timestamp: new Date().toISOString(),
    }
    safeWrite(contextBridgeFilePath(sessionId), JSON.stringify(data))
  } catch {
    // Best-effort.
  }
}

export function readBridgeFile(sessionId: string): ContextBridgeData | null {
  try {
    const filePath = contextBridgeFilePath(sessionId)
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as ContextBridgeData
  } catch {
    return null
  }
}
