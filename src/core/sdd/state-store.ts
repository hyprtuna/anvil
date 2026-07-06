/**
 * AnvilState read/write/update helpers (Plan 36 Phase C).
 *
 * Reads and writes `.anvil/state.json` per project.
 * Validates against the AnvilState Zod schema from Phase A.
 *
 * Layer 0 — imports only from node: and src/core/types.ts.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AnvilState } from '../types.js'
import type { AnvilState as AnvilStateType } from '../types.js'

const STATE_FILENAME = 'state.json'
const LEGACY_FILENAME = 'progress.json'
const ANVIL_DIR = '.anvil'

// Module-level flag: warn once per process about legacy progress.json.
let legacyWarningEmitted = false

/**
 * Reset the legacy-warning flag. ONLY for use in tests to isolate state
 * between test runs in the same Vitest worker process.
 * @internal
 */
export function _resetLegacyWarningForTest(): void {
  legacyWarningEmitted = false
}

function defaultState(): AnvilStateType {
  return {
    schema_version: 1,
    phase: 'none',
    completed_tasks: [],
    pending_tasks: [],
    updated_at: new Date().toISOString(),
  }
}

/**
 * Read `.anvil/state.json` from `cwd`.
 *
 * - On miss: returns a default state.
 * - On schema mismatch: throws with the found vs. expected schema_version.
 * - On legacy `.anvil/progress.json` present: logs a one-time warning to
 *   stderr and returns default (no merge — Anvil has no backwards-compat shims).
 */
export async function readState(cwd: string): Promise<AnvilStateType> {
  const anvilDir = join(cwd, ANVIL_DIR)
  const statePath = join(anvilDir, STATE_FILENAME)
  const legacyPath = join(anvilDir, LEGACY_FILENAME)

  // Warn once about legacy progress.json
  if (!legacyWarningEmitted) {
    try {
      await readFile(legacyPath, 'utf-8')
      legacyWarningEmitted = true
      process.stderr.write(
        '[anvil] note: legacy .anvil/progress.json detected; ignored — reinstall recreates state cleanly\n',
      )
    } catch {
      // Not present — no warning needed.
    }
  }

  let raw: string
  try {
    raw = await readFile(statePath, 'utf-8')
  } catch {
    // File absent — return default.
    return defaultState()
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    throw new Error(`[anvil] state-store: ${statePath} is not valid JSON`, {
      cause,
    })
  }

  // Check schema_version before full Zod parse for a clear error message.
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const rec = parsed as Record<string, unknown>
    const found = rec.schema_version
    if (found !== 1) {
      throw new Error(
        `[anvil] state-store: schema_version mismatch — expected 1, found ${JSON.stringify(found)}. Delete .anvil/state.json and reinstall to reset.`,
      )
    }
  }

  return AnvilState.parse(parsed)
}

/**
 * Write `state` to `.anvil/state.json` in `cwd`.
 * Sets `updated_at` to the current ISO timestamp.
 * Uses atomic tmp → rename to avoid corruption.
 */
export async function writeState(
  cwd: string,
  state: AnvilStateType,
): Promise<void> {
  const anvilDir = join(cwd, ANVIL_DIR)
  const statePath = join(anvilDir, STATE_FILENAME)
  const tmpPath = `${statePath}.tmp`

  const toWrite: AnvilStateType = {
    ...state,
    updated_at: new Date().toISOString(),
  }

  await mkdir(anvilDir, { recursive: true })
  await writeFile(tmpPath, `${JSON.stringify(toWrite, null, 2)}\n`, 'utf-8')
  await rename(tmpPath, statePath)
}

/**
 * Read, mutate via `mutator`, write, and return the final state.
 * `updated_at` is set to now by `writeState`.
 */
export async function updateState(
  cwd: string,
  mutator: (s: AnvilStateType) => AnvilStateType,
): Promise<AnvilStateType> {
  const current = await readState(cwd)
  const next = mutator(current)
  await writeState(cwd, next)
  return { ...next, updated_at: new Date().toISOString() }
}
