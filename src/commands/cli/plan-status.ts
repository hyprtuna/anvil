/**
 * `anvil plan-status <run-dir>` (ANV-0025 Wave 3).
 *
 * Read-only status reader: loads the plan snapshot + journal from a run
 * directory and prints a one-line JSON (or pretty) summary of the
 * computed state.
 *
 * Output shape mirrors the existing `anvil plan-validate`:
 *   - On success (run dir resolvable, journal parses): prints a one-line
 *     JSON envelope to stdout (`--json`) or a short human line.
 *   - On failure: prints reason to stderr and exits 1.
 *
 * NOT in this command (Wave 4 will own it):
 *   - `anvil plan run` — autonomous execution.
 *   - Mutation of the run state. This command is read-only.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import chalk from 'chalk'
import {
  PLAN_SNAPSHOT_FILENAME,
  readEvents,
  replayState,
} from '../../core/plans/index.js'
import type { ExecutablePlan } from '../../core/plans/schema.js'

interface StatusEnvelope {
  ok: boolean
  runDir: string
  reason?: string
  message?: string
  runId?: string
  planVersion?: string
  status?: string
  currentPhaseId?: string | null
  currentTaskId?: string | null
  startedAt?: string | null
  updatedAt?: string | null
  completedAt?: string | null
  eventCount?: number
}

export async function planStatusCommand(
  runDir: string,
  opts: { json?: boolean } = {},
): Promise<void> {
  const absolute = resolve(runDir)
  const json = opts.json === true

  if (!existsSync(absolute)) {
    return fail(json, {
      ok: false,
      runDir: absolute,
      reason: 'run-dir-missing',
      message: `run directory does not exist: ${absolute}`,
    })
  }

  const planPath = join(absolute, PLAN_SNAPSHOT_FILENAME)
  if (!existsSync(planPath)) {
    return fail(json, {
      ok: false,
      runDir: absolute,
      reason: 'plan-snapshot-missing',
      message: `plan snapshot not found at ${planPath}`,
    })
  }

  let plan: ExecutablePlan
  try {
    // plan.yml is written as JSON-shaped YAML; read it as JSON.
    plan = JSON.parse(readFileSync(planPath, 'utf-8')) as ExecutablePlan
  } catch (err) {
    return fail(json, {
      ok: false,
      runDir: absolute,
      reason: 'plan-snapshot-unreadable',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  let events: Awaited<ReturnType<typeof readEvents>>
  try {
    events = await readEvents(absolute)
  } catch (err) {
    return fail(json, {
      ok: false,
      runDir: absolute,
      reason: 'journal-unreadable',
      message: err instanceof Error ? err.message : String(err),
    })
  }

  const state = replayState(plan, events)
  const payload: StatusEnvelope = {
    ok: true,
    runDir: absolute,
    runId: state.runId,
    planVersion: state.planVersion,
    status: state.status,
    currentPhaseId: state.currentPhaseId ?? null,
    currentTaskId: state.currentTaskId ?? null,
    startedAt: state.startedAt ?? null,
    updatedAt: state.updatedAt ?? null,
    completedAt: state.completedAt ?? null,
    eventCount: events.length,
  }

  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } else {
    process.stdout.write(
      chalk.green(
        `OK ${absolute}\n  run ${payload.runId} (${payload.planVersion}) — status: ${payload.status}\n  events: ${payload.eventCount}  phase: ${payload.currentPhaseId ?? '-'}  task: ${payload.currentTaskId ?? '-'}\n`,
      ),
    )
  }
}

function fail(json: boolean, payload: StatusEnvelope): never {
  if (json) {
    process.stdout.write(`${JSON.stringify(payload)}\n`)
  } else {
    process.stderr.write(chalk.red(`FAIL ${payload.runDir}\n`))
    process.stderr.write(`  reason: ${payload.reason}\n`)
    if (payload.message !== undefined) {
      process.stderr.write(`  ${payload.message}\n`)
    }
  }
  process.exit(1)
}
