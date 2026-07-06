/**
 * Append-only JSONL event recorder for the plan-runner (ANV-0025 Wave 3).
 *
 * Layer 0 (core) — owns I/O against the run directory.
 *
 * Responsibilities (Wave 3):
 *   - Append validated events to `<runDir>/events.jsonl` as one JSON object
 *     per line.
 *   - Provide idempotent emission: a `requestHash` already seen MUST NOT
 *     re-append the line. This makes the recorder safe to call on retry
 *     paths (network blips, crash-restart).
 *   - Read the journal back as a typed array (`readEvents`).
 *
 * Out of scope (Wave 4):
 *   - The runner state machine that *decides* which event to record.
 *   - Retry-once classification.
 *   - Re-query-after-step / verify-blocks-advance logic.
 *
 * Invariants:
 *   - Journal is append-only. No previous line is ever rewritten.
 *   - One event per line. Lines are JSON.stringify'd (no embedded newlines).
 *   - `events.jsonl` ends in a newline after each appended event.
 *   - Empty / missing journal reads return `[]` (not an error).
 */

import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PlanRunEvent } from './events/schema.js'

// ─── Public types ────────────────────────────────────────────────────────────

/** A run recorder bound to a specific run directory. */
export interface PlanRunRecorder {
  /** The run directory this recorder writes to (absolute path). */
  readonly runDir: string
  /** The run ID this recorder is bound to. */
  readonly runId: string
  /** Plan version this run targets. */
  readonly planVersion: string
  /**
   * Append a validated event. No-ops when the event's `requestHash` has
   * already been recorded (idempotency).
   *
   * Throws if the event fails schema validation, or if the event's
   * `runId` / `planVersion` disagrees with the recorder's binding.
   */
  recordEvent(event: PlanRunEvent): Promise<RecordResult>
}

/** Outcome of a single `recordEvent` call. */
export type RecordResult =
  | { ok: true; status: 'appended'; event: PlanRunEvent }
  | { ok: true; status: 'duplicate'; existingEvent: PlanRunEvent }

/** Options for creating a recorder. */
export interface CreateRecorderOpts {
  /** Run identifier — bound at recorder creation. */
  runId: string
  /** Plan version the run targets. */
  planVersion: string
  /** Absolute path to the run directory (will be created if missing). */
  runDir: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

/** Journal file name inside the run directory. */
export const EVENTS_JOURNAL_FILENAME = 'events.jsonl'

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a recorder bound to a run directory.
 *
 * Pure factory — does NOT create the run directory eagerly. The first
 * `recordEvent` call will `mkdir -p` lazily so callers that want to peek
 * at a pre-existing run dir don't accidentally re-create it.
 *
 * Idempotency state (the `requestHash` set) is lazily hydrated from disk
 * on the first call.
 */
export function createRunRecorder(opts: CreateRecorderOpts): PlanRunRecorder {
  const { runId, planVersion, runDir } = opts
  if (runId.length === 0) throw new Error('runId must be non-empty')
  if (planVersion.length === 0) throw new Error('planVersion must be non-empty')
  if (runDir.length === 0) throw new Error('runDir must be non-empty')

  // Lazily-hydrated dedup index: requestHash → existing event.
  // Populated from disk on first call so a process-restart still
  // recognises previously-recorded requestHashes.
  let seen: Map<string, PlanRunEvent> | null = null
  let hydrationPromise: Promise<void> | null = null

  async function hydrate(): Promise<void> {
    if (seen !== null) return
    if (hydrationPromise !== null) {
      await hydrationPromise
      return
    }
    hydrationPromise = (async () => {
      const map = new Map<string, PlanRunEvent>()
      const journalPath = join(runDir, EVENTS_JOURNAL_FILENAME)
      if (existsSync(journalPath)) {
        const existing = await readEvents(runDir)
        for (const ev of existing) {
          // Last-write-wins is fine — we only ever skip; we never re-emit.
          map.set(ev.requestHash, ev)
        }
      }
      seen = map
    })()
    await hydrationPromise
  }

  async function recordEvent(event: PlanRunEvent): Promise<RecordResult> {
    // Validate at the boundary. Zod rejects unknown kinds, malformed
    // timestamps, missing requestHash, etc.
    const parsed = PlanRunEvent.parse(event)

    if (parsed.runId !== runId) {
      throw new Error(
        `event.runId "${parsed.runId}" does not match recorder runId "${runId}"`,
      )
    }
    if (parsed.planVersion !== planVersion) {
      throw new Error(
        `event.planVersion "${parsed.planVersion}" does not match recorder planVersion "${planVersion}"`,
      )
    }

    await hydrate()
    // Safety: hydrate() always assigns `seen` before returning.
    const dedup = seen as Map<string, PlanRunEvent>

    const existing = dedup.get(parsed.requestHash)
    if (existing !== undefined) {
      return { ok: true, status: 'duplicate', existingEvent: existing }
    }

    await mkdir(runDir, { recursive: true })
    const line = `${JSON.stringify(parsed)}\n`
    await appendFile(join(runDir, EVENTS_JOURNAL_FILENAME), line, 'utf-8')
    dedup.set(parsed.requestHash, parsed)
    return { ok: true, status: 'appended', event: parsed }
  }

  return {
    runDir,
    runId,
    planVersion,
    recordEvent,
  }
}

// ─── Reader ──────────────────────────────────────────────────────────────────

/**
 * Read every event from a run directory's journal.
 *
 * Returns `[]` when the journal is missing or empty. Throws if any line
 * fails JSON parse or schema validation — a corrupt journal is a hard
 * error that the caller should surface, not silently swallow.
 */
export async function readEvents(runDir: string): Promise<PlanRunEvent[]> {
  const journalPath = join(runDir, EVENTS_JOURNAL_FILENAME)
  if (!existsSync(journalPath)) return []
  const raw = await readFile(journalPath, 'utf-8')
  if (raw.length === 0) return []

  const events: PlanRunEvent[] = []
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line === undefined || line.length === 0) continue
    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(line)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(
        `events.jsonl line ${i + 1} is not valid JSON: ${message}`,
      )
    }
    const result = PlanRunEvent.safeParse(parsedJson)
    if (!result.success) {
      throw new Error(
        `events.jsonl line ${i + 1} failed schema validation: ${result.error.issues
          .map((iss) => `${iss.path.join('.') || '(root)'}: ${iss.message}`)
          .join('; ')}`,
      )
    }
    events.push(result.data)
  }
  return events
}
