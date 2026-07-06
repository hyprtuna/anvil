/**
 * On-disk snapshot store for observability hooks — ANV-0023.
 *
 * The PreCompact / InstructionsLoaded / PostCompact triplet needs a
 * shared transport so a post-compact handler (fired in a new session
 * after compaction) can compare against the pre-compact baseline.
 * This module is the transport.
 *
 * Snapshots live under `<cwd>/.anvil/notepads/observability/`:
 *   instructions-loaded.json   — baseline (overwritten each session)
 *   pre-compact.json           — most recent pre-compact snapshot
 *
 * Both files carry the same shape: `RuleSnapshot`.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { safeWrite } from '../../../core/io/safe-write.js'

export const RuleSnapshot = z.object({
  /** ISO 8601 timestamp the snapshot was captured. */
  capturedAt: z.string().min(1),
  /** Total bytes loaded across all rule sources. */
  totalBytes: z.number().int().nonnegative(),
  /** Rule source names captured (e.g. "AGENTS.md", "rules/anvil-routing.md"). */
  sourceNames: z.array(z.string()),
})
export type RuleSnapshot = z.infer<typeof RuleSnapshot>

const OBSERVABILITY_SUBDIR = join('.anvil', 'notepads', 'observability')
const INSTRUCTIONS_FILE = 'instructions-loaded.json'
const PRE_COMPACT_FILE = 'pre-compact.json'

/** Resolve the directory snapshots live in for `cwd`. */
export function observabilityDir(cwd: string): string {
  return join(cwd, OBSERVABILITY_SUBDIR)
}

export function instructionsSnapshotPath(cwd: string): string {
  return join(observabilityDir(cwd), INSTRUCTIONS_FILE)
}

export function preCompactSnapshotPath(cwd: string): string {
  return join(observabilityDir(cwd), PRE_COMPACT_FILE)
}

/**
 * Write a snapshot to disk. Creates the parent directory if missing.
 * Never throws — observability writes must not block hook execution.
 * Returns true on success.
 */
export function writeSnapshot(path: string, snapshot: RuleSnapshot): boolean {
  try {
    const dir = path.slice(0, path.lastIndexOf('/'))
    mkdirSync(dir, { recursive: true })
    safeWrite(path, JSON.stringify(snapshot, null, 2), { maxBytes: 64 * 1024 })
    return true
  } catch {
    return false
  }
}

/**
 * Read a snapshot from disk. Returns null when the file is missing or
 * malformed (never throws — caller decides how to handle absence).
 */
export function readSnapshot(path: string): RuleSnapshot | null {
  try {
    if (!existsSync(path)) return null
    const raw = readFileSync(path, 'utf-8')
    const parsed = RuleSnapshot.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/**
 * Compute the set of rule names present in `baseline.sourceNames` but
 * absent from `current.sourceNames`. Pure helper consumed by the
 * PostCompact degradation detector.
 */
export function diffLostRules(
  baseline: RuleSnapshot,
  current: RuleSnapshot,
): string[] {
  const observed = new Set(current.sourceNames)
  return baseline.sourceNames.filter((n) => !observed.has(n))
}
