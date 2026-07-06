/**
 * ANV-0190 — Focused test runner returning agent-friendly JSON.
 * ANV-0200 — Removed anti-recursion sentinel and --exclude workaround.
 *            Now exports runTests() for in-process callers.
 *
 * Wraps `bunx vitest run --reporter=json` with optional pattern filter.
 *
 * Output shape (matches scripts/agent/test-summary.ts):
 *   { ok, pass, fail, skip, durationMs, failures: [{file, name, line, message}] }
 *
 * Args:
 *   --pattern <glob>  optional test name/file pattern
 *   --fresh           bypass any cache
 *   --json            (default true) emit JSON to stdout
 *
 * Sets ANVIL_GATE_NO_REBUILD=1 for agent ergonomics (skip dist/ rebuild).
 *
 * Exit 0 on success (all tests pass), exit 2 on failure.
 * Never writes to stderr unless --debug is passed.
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEBUG = process.argv.includes('--debug')
const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestFailure {
  file: string
  name: string
  line: number
  message: string
}

export interface TestOutput {
  ok: boolean
  pass: number
  fail: number
  skip: number
  durationMs: number
  failures: TestFailure[]
}

interface Failure {
  ok: false
  error: string
}

// ---------------------------------------------------------------------------
// Vitest JSON report shape (subset)
// ---------------------------------------------------------------------------

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
      location?: { line: number }
    }>
  }>
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

function parseVitestJson(raw: string): TestOutput | Failure {
  let report: VitestReport
  try {
    report = JSON.parse(raw) as VitestReport
  } catch {
    return { ok: false, error: 'failed to parse vitest JSON report' }
  }

  const failures: TestFailure[] = []
  let durationMs = 0

  for (const suite of report.testResults ?? []) {
    durationMs += (suite.endTime ?? 0) - (suite.startTime ?? 0)
    for (const test of suite.assertionResults ?? []) {
      if (test.status === 'failed') {
        failures.push({
          file: suite.name,
          name: test.fullName,
          line: test.location?.line ?? 0,
          message: test.failureMessages[0] ?? '',
        })
      }
    }
  }

  const fail = report.numFailedTests ?? 0
  return {
    ok: fail === 0,
    pass: report.numPassedTests ?? 0,
    fail,
    skip: report.numPendingTests ?? 0,
    durationMs,
    failures,
  }
}

/**
 * Run vitest with an optional file-path pattern filter, return structured JSON.
 * Uses spawnSync to call `bun run vitest run --reporter=json [pattern]`.
 * Exported so tests can call this without CLI subprocess overhead.
 */
export function runTests(pattern?: string): TestOutput | Failure {
  // pattern is treated as a file path filter (vitest positional arg)
  // This allows narrow runs like: --pattern lint-roots
  const args = ['run', 'vitest', 'run', '--reporter=json']
  if (pattern) {
    args.push(pattern)
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ANVIL_GATE_NO_REBUILD: '1',
  }

  const result = spawnSync('bun', args, {
    cwd: ROOT,
    shell: false,
    encoding: 'utf-8',
    env,
  })

  const stdout = (result.stdout ?? '').toString().trim()
  const stderr = (result.stderr ?? '').toString()

  if (DEBUG && stderr) {
    process.stderr.write(stderr)
  }

  if (!stdout) {
    return {
      ok: false,
      error: `vitest exited ${result.status ?? 1} with no JSON output`,
    }
  }

  return parseVitestJson(stdout)
}

function printOrFail(value: TestOutput | Failure): never {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  const v = value as Record<string, unknown>
  process.exit(v.ok === false ? 2 : 0)
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(): { pattern?: string } {
  const args = process.argv.slice(2)
  let pattern: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--pattern' && args[i + 1]) {
      pattern = args[i + 1]
      i++
    }
  }

  return { pattern }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const { pattern } = parseArgs()
  const result = runTests(pattern)
  printOrFail(result)
}

// Canonical ESM main-guard (matches scripts/agent/_lib.ts pattern)
const moduleFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (moduleFile === entryFile) {
  main()
}
