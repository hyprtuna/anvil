/**
 * Run-bootstrap helpers (ANV-0025 Wave 3).
 *
 * Layer 0 (core) — owns I/O against a new run directory.
 *
 * `bootstrapRun(plan, runDir)`:
 *   1. Creates `<runDir>` (recursive).
 *   2. Snapshots the plan into `<runDir>/plan.yml` (verbatim — survives
 *      deletion of the source markdown).
 *   3. Constructs the initial `PlanRunState` (status: pending) and writes
 *      it to `<runDir>/state.yml` as a fast-read cache.
 *   4. Creates a recorder and emits exactly one `PlanRunStartedEvent`,
 *      flipping the state to `in_progress`.
 *   5. Writes the post-event state back to `state.yml`.
 *   6. Returns the live `PlanRunState`.
 *
 * Persistence format note: the `.yml` files are written as pretty-printed
 * JSON. JSON is a valid YAML subset, so the files parse with any YAML
 * reader, and we avoid adding a dedicated YAML serializer dependency.
 * If a future ticket wants prettier YAML output it can switch the writer
 * in one place — the file extension stays `.yml`.
 *
 * Out of scope (Wave 4):
 *   - Authoring further events (phase / task / gate / etc.). The runner
 *     state machine owns that.
 *   - Resume-from-snapshot helpers (those will join Wave 4 alongside the
 *     runner).
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { PlanRunEvent } from './events/schema.js'
import { type PlanRunRecorder, createRunRecorder } from './recorder.js'
import { type PlanRunState, applyEvent, initialRunState } from './run-state.js'
import type { ExecutablePlan } from './schema.js'

// ─── Filenames ───────────────────────────────────────────────────────────────

export const PLAN_SNAPSHOT_FILENAME = 'plan.yml'
export const STATE_SNAPSHOT_FILENAME = 'state.yml'

// ─── Public API ──────────────────────────────────────────────────────────────

export interface BootstrapOpts {
  /** Run identifier (free-form, see RunIdPattern in events/schema.ts). */
  runId: string
  /** Absolute path to the run directory (created if missing). */
  runDir: string
  /** The plan to snapshot and run against. */
  plan: ExecutablePlan
  /**
   * Idempotency hash for the bootstrap `PlanRunStartedEvent`.
   * Calling `bootstrapRun` twice with the same `requestHash` is a no-op
   * for the journal; the state.yml will reflect the post-start state
   * either way.
   */
  requestHash?: string
  /**
   * Clock injection — primarily for tests. Defaults to `new Date()`.
   * Used for both the run-start event timestamp and the initial state's
   * `startedAt` / `updatedAt`.
   */
  now?: () => Date
}

export interface BootstrapResult {
  state: PlanRunState
  recorder: PlanRunRecorder
}

/**
 * Bootstrap a new run directory: snapshot, state file, run-started event.
 */
export async function bootstrapRun(
  opts: BootstrapOpts,
): Promise<BootstrapResult> {
  const {
    runId,
    runDir,
    plan,
    requestHash = `${runId}.plan_run_started`,
    now = () => new Date(),
  } = opts

  if (runId.length === 0) throw new Error('runId must be non-empty')
  if (runDir.length === 0) throw new Error('runDir must be non-empty')

  await mkdir(runDir, { recursive: true })

  // 1. Snapshot the plan (verbatim). Skip the write if a snapshot exists —
  //    bootstrapping an already-bootstrapped run must be idempotent.
  const planPath = join(runDir, PLAN_SNAPSHOT_FILENAME)
  if (!existsSync(planPath)) {
    await writeFile(planPath, formatYamlJson(plan), 'utf-8')
  }

  // 2. Initial pending state. (We may immediately overwrite it after the
  //    run-started event below — that is fine; state.yml is a cache.)
  let state = initialRunState(runId, plan)
  await writeStateFile(runDir, state)

  // 3. Recorder + run-started event.
  const recorder = createRunRecorder({
    runId,
    planVersion: plan.version,
    runDir,
  })
  const startedAt = now().toISOString()
  const startEvent: PlanRunEvent = {
    kind: 'plan_run_started',
    timestamp: startedAt,
    runId,
    planVersion: plan.version,
    requestHash,
  }
  await recorder.recordEvent(startEvent)

  // 4. Apply the event and persist the post-start state.
  state = applyEvent(state, startEvent)
  await writeStateFile(runDir, state)

  return { state, recorder }
}

// ─── Persistence helpers (exported for tests / status command) ───────────────

/**
 * Write a `state.yml` snapshot. Overwrites the file atomically-enough
 * for our needs (no concurrent writers — the recorder is the only
 * authority on run progress; this file is a derived cache).
 */
export async function writeStateFile(
  runDir: string,
  state: PlanRunState,
): Promise<void> {
  await mkdir(runDir, { recursive: true })
  await writeFile(
    join(runDir, STATE_SNAPSHOT_FILENAME),
    formatYamlJson(state),
    'utf-8',
  )
}

/**
 * Format a value as YAML-compatible JSON (pretty-printed, 2-space indent,
 * trailing newline). JSON is a valid YAML subset, so the file parses with
 * any YAML or JSON reader.
 */
function formatYamlJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
