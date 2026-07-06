/**
 * ANV-0190 — Combined repo-state JSON emitter.
 * ANV-0200 — Refactored to call helpers in-process (no subprocess spawns).
 *
 * Imports scripts/agent/* helpers directly and merges their outputs into one
 * JSON object:
 *   { branch, dirty, tests, gate, ticketCounter }
 *
 * Args:
 *   --no-tests   skip test-summary (may be slow)
 *   --json       (default) emit JSON to stdout
 *
 * Exit 0 on success, exit 2 on failure.
 * Never writes to stderr unless --debug is passed.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getBranchStateReal } from '../agent/branch-state.js'
import { getDirtyFilesReal } from '../agent/dirty-files.js'
import { getGateStatusReal } from '../agent/gate-status.js'
import { getTestSummaryReal } from '../agent/test-summary.js'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatusOutput {
  ok: true
  branch: Record<string, unknown>
  dirty: Record<string, unknown>
  tests: Record<string, unknown> | null
  gate: Record<string, unknown>
  ticketCounter: number
}

interface Failure {
  ok: false
  error: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readTicketCounter(): number {
  const counterPath = join(ROOT, '.anvil', '_ticket-counter.txt')
  if (!existsSync(counterPath)) return 0
  try {
    const raw = readFileSync(counterPath, 'utf-8').trim()
    const n = Number.parseInt(raw, 10)
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export interface CheckStatusOptions {
  skipTests?: boolean
  /** Skip running gate-status (which spawns `bun run gate`). */
  skipGate?: boolean
}

export async function getCheckStatus(
  opts: CheckStatusOptions = {},
): Promise<StatusOutput | Failure> {
  const { skipTests = false, skipGate = false } = opts

  const branch = getBranchStateReal()
  if (branch.ok === false) {
    return branch
  }

  const dirty = getDirtyFilesReal()
  if (dirty.ok === false) {
    return dirty
  }

  // Gate is allowed to fail (e.g., timeout running the full suite); we still
  // emit a `gate` field with the failure shape so downstream consumers see it.
  const gate: Record<string, unknown> | Failure = skipGate
    ? { ok: false, error: 'gate-status skipped' }
    : await getGateStatusReal()

  let tests: Record<string, unknown> | null = null
  if (!skipTests && !skipGate) {
    const testsResult = getTestSummaryReal()
    tests = testsResult as Record<string, unknown>
  }

  const ticketCounter = readTicketCounter()

  return {
    ok: true,
    branch: branch as unknown as Record<string, unknown>,
    dirty: dirty as unknown as Record<string, unknown>,
    tests,
    gate: gate as Record<string, unknown>,
    ticketCounter,
  }
}

function printOrFail(value: StatusOutput | Failure): never {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  const v = value as Record<string, unknown>
  process.exit(v.ok === false ? 2 : 0)
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { skipTests: boolean } {
  const args = process.argv.slice(2)
  const skipTests = args.includes('--no-tests')
  return { skipTests }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { skipTests } = parseArgs()
  const result = await getCheckStatus({ skipTests, skipGate: false })
  printOrFail(result)
}

// Canonical ESM main-guard
const moduleFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (moduleFile === entryFile) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err)
    process.stdout.write(`${JSON.stringify({ ok: false, error: msg })}\n`)
    process.exit(2)
  })
}
