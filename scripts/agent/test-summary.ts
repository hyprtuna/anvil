/**
 * ANV-0156 — test-summary helper.
 *
 * Reads a vitest JSON report (from the cache file at .anvil/vitest-report.json
 * if it's less than 10 minutes old) or runs vitest --reporter=json on demand.
 *
 * Emits a single JSON object to stdout:
 *   TestSummary { ok, pass, fail, skip, durationMs,
 *                 failures: Array<{file, name, message}> }
 *
 * Exit 0 on success, exit 2 on failure (with { ok: false, error }).
 * Never writes to stderr unless --debug is passed.
 *
 * Usage:
 *   bunx tsx scripts/agent/test-summary.ts          # uses cache if fresh
 *   bunx tsx scripts/agent/test-summary.ts --fresh  # always re-runs vitest
 */

import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  type Failure,
  ROOT,
  type RunResult,
  mainGuard,
  printOrFail,
  runProcess,
} from './_lib.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestSummaryFailure {
  file: string
  name: string
  message: string
}

export interface TestSummary {
  ok: true
  pass: number
  fail: number
  skip: number
  durationMs: number
  failures: TestSummaryFailure[]
}

/** Vitest JSON report shape (subset we care about). */
interface VitestReport {
  numPassedTests: number
  numFailedTests: number
  numPendingTests: number
  startTime: number
  testResults: Array<{
    name: string
    startTime: number
    endTime: number
    assertionResults: Array<{
      fullName: string
      status: string
      failureMessages: string[]
    }>
  }>
}

// ---------------------------------------------------------------------------
// Cache path
// ---------------------------------------------------------------------------

const CACHE_PATH = join(ROOT, '.anvil', 'vitest-report.json')
const CACHE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minutes

// ---------------------------------------------------------------------------
// Core logic (dependency-injected for unit tests)
// ---------------------------------------------------------------------------

export interface TestSummaryDeps {
  now: () => number
  readCache: (path: string) => string | null
  writeCache: (path: string, content: string) => void
  runVitest: () => RunResult
}

export function loadTestSummary(deps: TestSummaryDeps): TestSummary | Failure {
  const { now, readCache, writeCache, runVitest } = deps

  // 1. Try cache first (unless --fresh flag)
  const forceFresh = process.argv.includes('--fresh')
  if (!forceFresh) {
    const cached = readCache(CACHE_PATH)
    if (cached !== null) {
      return parseVitestJson(cached)
    }
  }

  // 2. Run vitest with JSON reporter
  const result = runVitest()
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    return {
      ok: false,
      error: `vitest exited ${result.exitCode} with no JSON output`,
    }
  }

  // 3. Parse output (vitest exits 1 on test failures but still outputs JSON)
  const raw = result.stdout.trim()
  if (!raw) {
    return { ok: false, error: 'vitest produced no output' }
  }

  // 4. Cache for next time
  try {
    writeCache(CACHE_PATH, raw)
  } catch {
    // non-fatal; cache write failure is okay
  }

  // Suppress unused variable warning on `now`
  void now

  return parseVitestJson(raw)
}

function parseVitestJson(raw: string): TestSummary | Failure {
  let report: VitestReport
  try {
    report = JSON.parse(raw) as VitestReport
  } catch {
    return { ok: false, error: 'failed to parse vitest JSON report' }
  }

  const failures: TestSummaryFailure[] = []
  let durationMs = 0

  for (const suite of report.testResults ?? []) {
    durationMs += (suite.endTime ?? 0) - (suite.startTime ?? 0)
    for (const test of suite.assertionResults ?? []) {
      if (test.status === 'failed') {
        failures.push({
          file: suite.name,
          name: test.fullName,
          message: test.failureMessages[0] ?? '',
        })
      }
    }
  }

  return {
    ok: true,
    pass: report.numPassedTests ?? 0,
    fail: report.numFailedTests ?? 0,
    skip: report.numPendingTests ?? 0,
    durationMs,
    failures,
  }
}

// ---------------------------------------------------------------------------
// Real deps
// ---------------------------------------------------------------------------

function realReadCache(path: string): string | null {
  if (!existsSync(path)) return null
  try {
    const stat = statSync(path)
    const age = Date.now() - stat.mtimeMs
    if (age > CACHE_MAX_AGE_MS) return null
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

function realWriteCache(path: string, content: string): void {
  writeFileSync(path, content, 'utf-8')
}

function realRunVitest(): RunResult {
  return runProcess('bun', ['run', 'vitest', 'run', '--reporter=json'], ROOT)
}

// ---------------------------------------------------------------------------
// Zero-argument in-process entry (for callers that don't need DI)
// ---------------------------------------------------------------------------

/**
 * Returns the test summary using real deps.
 * Intended for in-process callers (e.g. scripts/dev/check-status.ts).
 * For unit-test DI, use `loadTestSummary(deps)` directly.
 */
export function getTestSummaryReal(): TestSummary | Failure {
  return loadTestSummary({
    now: () => Date.now(),
    readCache: realReadCache,
    writeCache: realWriteCache,
    runVitest: realRunVitest,
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const result = loadTestSummary({
    now: () => Date.now(),
    readCache: realReadCache,
    writeCache: realWriteCache,
    runVitest: realRunVitest,
  })
  printOrFail(result)
}

mainGuard(import.meta.url, main)
