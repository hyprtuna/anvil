/**
 * Session-scoped state for the post-edit accumulator (Plan 43 Phase H).
 *
 * Each session id maps to a deduplicated Set of edited file paths persisted
 * at `~/.anvil/state/edit-accumulator-<sessionId>.json`. 24h TTL on the file;
 * stale files are deleted and recreated. Per-process cache avoids redundant
 * disk hits.
 */

import { mkdirSync, rmSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { safeWrite } from '../../../core/io/safe-write.js'

export interface EditAccumulatorState {
  paths: string[]
}

const TTL_MS = 24 * 60 * 60 * 1000

const PATH_CACHE = new Map<string, Set<string>>()

export function accumStateDir(): string {
  return join(homedir(), '.anvil', 'state')
}

export function accumStateFilePath(sessionId: string): string {
  return join(accumStateDir(), `edit-accumulator-${sessionId}.json`)
}

function ensureDir(): void {
  mkdirSync(accumStateDir(), { recursive: true })
}

function isStale(filePath: string): boolean {
  try {
    const stats = statSync(filePath)
    return Date.now() - stats.mtimeMs > TTL_MS
  } catch {
    return false
  }
}

function deleteFile(filePath: string): void {
  try {
    rmSync(filePath, { force: true })
  } catch {
    // best-effort
  }
}

export async function loadAccumState(sessionId: string): Promise<Set<string>> {
  const cached = PATH_CACHE.get(sessionId)
  if (cached) return cached

  const filePath = accumStateFilePath(sessionId)

  if (isStale(filePath)) {
    deleteFile(filePath)
    const fresh = new Set<string>()
    PATH_CACHE.set(sessionId, fresh)
    return fresh
  }

  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as EditAccumulatorState
    const set = new Set<string>(Array.isArray(parsed.paths) ? parsed.paths : [])
    PATH_CACHE.set(sessionId, set)
    return set
  } catch {
    const fresh = new Set<string>()
    PATH_CACHE.set(sessionId, fresh)
    return fresh
  }
}

export async function persistAccumState(
  sessionId: string,
  paths: Set<string>,
): Promise<void> {
  PATH_CACHE.set(sessionId, paths)
  try {
    ensureDir()
    const state: EditAccumulatorState = { paths: Array.from(paths) }
    // Edit-accumulator state can grow with the number of edited paths; cap at
    // 256 KB to leave headroom while still refusing oversize payloads.
    safeWrite(accumStateFilePath(sessionId), JSON.stringify(state, null, 2), {
      maxBytes: 256 * 1024,
    })
  } catch (err) {
    process.stderr.write(
      `[post-edit-accumulator] persist failed for session ${sessionId}: ${String(err)}\n`,
    )
  }
}

export async function clearAccumState(sessionId: string): Promise<void> {
  PATH_CACHE.delete(sessionId)
  deleteFile(accumStateFilePath(sessionId))
}

/** Exposed for testing only — clears the in-process cache. */
export function resetAccumCache(): void {
  PATH_CACHE.clear()
}
