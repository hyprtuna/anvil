/**
 * ANV-0033 — Capability snapshot loader and provenance lookup.
 *
 * This module is the single point for reading the bundled
 * `data/model-capabilities.json` file and for resolving the
 * `CapabilitySource` provenance tag for a given model ID.
 *
 * Design constraints:
 * - `loadBundledSnapshot()` reads disk once and memoises the result.
 * - `lookupCapability()` is pure — it never calls `loadBundledSnapshot()`.
 *   The snapshot is always threaded in by the caller (D-03).
 * - No I/O is triggered at module import time.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  CapabilitySource,
  ModelCapability,
  ModelCapabilitySnapshot,
} from '../types.js'
import { ModelCapabilitySnapshot as ModelCapabilitySnapshotSchema } from '../types.js'
import { BUILTIN_SUPPORTED_EFFORTS } from './effort.js'

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Snapshot freshness threshold. Doctor warns when `generated_at` is older
 * than this many days. Tunable constant — not yet config-driven.
 */
export const MAX_SNAPSHOT_AGE_DAYS = 90

/**
 * Candidate paths probed by `loadBundledSnapshot()`.
 * Exported for introspection in tests (not part of the public API).
 *
 * - `candidates[0]` — dev layout: file is `src/core/models/capability-snapshot.ts`,
 *   so `data/` is three directories up.
 * - `candidates[1]` — dist layout: file is `dist/core/models/capability-snapshot.js`,
 *   so `data/` is also three directories up (same relative path works for both).
 * - `candidates[2]` — bundled-runtime layout (ANV-0161): esbuild shims
 *   `import.meta.url` to the bundle's own path (`dist/anvil-bundle.cjs`), so
 *   `here` resolves to `dist/`. The build step (scripts/build-bundle.mjs) stages
 *   `data/model-capabilities.json` alongside the bundle at `dist/data/`, and
 *   the installer mirrors `dist/` to `~/.anvil/runtime/dist/`. This candidate
 *   resolves against `here` with no `../` prefix so it matches that layout.
 *
 * Note: candidates[0] and candidates[1] resolve to the same absolute path when
 * the file structure is consistent. The list exists for robustness across future
 * layout changes, mirroring the pattern in `src/core/package-meta.ts`.
 */
export function getCandidatePaths(): readonly string[] {
  const here = dirname(fileURLToPath(import.meta.url))
  return [
    resolve(here, '../../../data/model-capabilities.json'), // dev: src/core/models/
    resolve(here, '../../data/model-capabilities.json'), // dist: dist/core/models/
    resolve(here, 'data/model-capabilities.json'), // bundled dist: dist/anvil-bundle.cjs
  ]
}

// ─── Loader ─────────────────────────────────────────────────────────────────

let cachedSnapshot: ModelCapabilitySnapshot | undefined

/**
 * Loads the bundled `data/model-capabilities.json` snapshot.
 *
 * Memoised — the file is read and parsed at most once per process.
 * Throws with all attempted paths if no readable, valid candidate is found.
 * Also throws if the parsed snapshot contains duplicate model IDs.
 */
export function loadBundledSnapshot(): ModelCapabilitySnapshot {
  if (cachedSnapshot !== undefined) return cachedSnapshot

  const candidates = getCandidatePaths()
  const errors: string[] = []

  for (const candidate of candidates) {
    try {
      const raw = readFileSync(candidate, 'utf-8')
      const parsed = ModelCapabilitySnapshotSchema.parse(JSON.parse(raw))

      // Explicit duplicate-id check (Zod does not deduplicate arrays).
      const ids = parsed.models.map((m) => m.id)
      const seen = new Set<string>()
      const duplicates: string[] = []
      for (const id of ids) {
        if (seen.has(id)) {
          duplicates.push(id)
        } else {
          seen.add(id)
        }
      }
      if (duplicates.length > 0) {
        throw new Error(
          `model-capabilities.json contains duplicate model IDs: ${duplicates.join(', ')}`,
        )
      }

      cachedSnapshot = parsed
      return cachedSnapshot
    } catch (err) {
      errors.push(
        `  ${candidate}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  throw new Error(
    `capability-snapshot: unable to load bundled snapshot from any candidate path:\n${errors.join('\n')}`,
  )
}

/**
 * Resets the memoised snapshot. For use in tests only.
 * @internal
 */
export function _resetSnapshotCache(): void {
  cachedSnapshot = undefined
}

// ─── Lookup ─────────────────────────────────────────────────────────────────

/**
 * Family-pattern heuristics for rule D-05 step 3.
 * A model ID matching any of these prefixes resolves to `'heuristic'`.
 * This is an explicit allow-list — new families must be added deliberately.
 */
const KNOWN_FAMILY_PREFIXES: readonly string[] = [
  'claude-haiku-',
  'claude-sonnet-',
  'claude-opus-',
]

/**
 * Result of a capability provenance lookup.
 */
export interface CapabilityLookupResult {
  source: CapabilitySource
  capability?: ModelCapability
}

/**
 * Resolves the `CapabilitySource` provenance tag for a given model ID.
 *
 * Four-step rule (D-05):
 *   1. Exact ID match in snapshot → `'snapshot'`.
 *   2. Exact ID match in `BUILTIN_SUPPORTED_EFFORTS` → `'heuristic'`.
 *   3. Substring-family match (known `claude-*-` prefixes) → `'heuristic'`.
 *   4. Otherwise → `'unknown'`.
 *
 * **Pure** — never calls `loadBundledSnapshot()`. The caller must supply
 * the snapshot (threaded via `ResolveOptions.capabilityRegistry`, per D-03).
 *
 * @param modelId  - Concrete model ID to look up (e.g., the value from `ModelResolution.model`).
 * @param snapshot - The snapshot to consult (pass from `loadBundledSnapshot()`).
 * @param effortsRegistry - Optional override for `BUILTIN_SUPPORTED_EFFORTS`
 *   (injected in tests to avoid global state mutation).
 */
export function lookupCapability(
  modelId: string,
  snapshot: ModelCapabilitySnapshot,
  effortsRegistry?: Record<string, unknown>,
): CapabilityLookupResult {
  // Rule 1: exact match in snapshot
  const snapshotEntry = snapshot.models.find((m) => m.id === modelId)
  if (snapshotEntry !== undefined) {
    return { source: 'snapshot', capability: snapshotEntry }
  }

  // Rule 2: exact match in BUILTIN_SUPPORTED_EFFORTS (or injected registry)
  const efforts = effortsRegistry ?? BUILTIN_SUPPORTED_EFFORTS
  if (modelId in efforts) {
    return { source: 'heuristic' }
  }

  // Rule 3: family-pattern match
  for (const prefix of KNOWN_FAMILY_PREFIXES) {
    if (modelId.startsWith(prefix)) {
      return { source: 'heuristic' }
    }
  }

  // Rule 4: unknown
  return { source: 'unknown' }
}

// ─── Freshness helpers ───────────────────────────────────────────────────────

/**
 * Computes how many days old the snapshot is relative to `now`.
 *
 * Pure — takes an optional `now` parameter for testability (default: `Date.now()`).
 *
 * @param snapshot - The snapshot to measure.
 * @param now      - Override for the current timestamp (ms since epoch).
 */
export function snapshotAgeDays(
  snapshot: ModelCapabilitySnapshot,
  now?: number,
): number {
  const generatedAt = new Date(snapshot.generated_at).getTime()
  const current = now ?? Date.now()
  const diffMs = current - generatedAt
  return diffMs / (1000 * 60 * 60 * 24)
}
