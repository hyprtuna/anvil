/**
 * ANV-0156 — gate-status helper.
 *
 * Wraps `bun run gate` and emits a single JSON object to stdout:
 *   GateStatus { ok, lint, typecheck, tests: { pass, fail }, rebaseBase,
 *                overall: 'pass'|'fail', durationMs }
 *
 * Exit 0 on success (overall pass), exit 2 on failure (with { ok: false, error }
 * or gate fail indicated by overall: 'fail').
 * Never writes to stderr unless --debug is passed.
 *
 * Usage:
 *   bunx tsx scripts/agent/gate-status.ts | jq .
 */

import { spawn } from 'node:child_process'
import { parseVitestCounts } from '../../scripts/ci/gate.js'
import { type Failure, ROOT, mainGuard, printOrFail } from './_lib.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GateStatus {
  ok: true
  lint: 'pass' | 'fail' | 'skip'
  typecheck: 'pass' | 'fail' | 'skip'
  tests: { pass: number; fail: number }
  rebaseBase: 'pass' | 'fail' | 'skip'
  overall: 'pass' | 'fail'
  durationMs: number
}

// ---------------------------------------------------------------------------
// Deps type (for DI in unit tests)
// ---------------------------------------------------------------------------

export interface GateStatusDeps {
  runGate: () => Promise<{ stdout: string; exitCode: number }>
  now: () => number
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export async function getGateStatus(
  deps: GateStatusDeps,
): Promise<GateStatus | Failure> {
  const { runGate, now } = deps
  const start = now()

  let gateOut: { stdout: string; exitCode: number }
  try {
    gateOut = await runGate()
  } catch (e) {
    return {
      ok: false,
      error: `gate failed to run: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const { stdout, exitCode } = gateOut
  const durationMs = now() - start
  const overall: 'pass' | 'fail' = exitCode === 0 ? 'pass' : 'fail'

  // Parse phase results from the gate summary line:
  // "gate: lint ✓  base ✓  typecheck ✓  tests 4784/4794 ✓"
  const summaryMatch = stdout.match(/^gate:.+$/m)
  const summary = summaryMatch ? summaryMatch[0] : ''

  const lint = parsePhase(summary, 'lint')
  const typecheck = parsePhase(summary, 'typecheck')
  const rebaseBase = parsePhase(summary, 'base')

  // Parse test counts from vitest output
  const counts = parseVitestCounts(stdout)
  const testPass = counts?.passed ?? 0

  // Parse failed count directly from vitest summary line
  // e.g. "Tests  3 failed | 4781 passed | 10 skipped (4794)"
  const failMatch = stdout.match(/\b(\d+)\s+failed\b/)
  const testFail = failMatch ? Number.parseInt(failMatch[1] ?? '0', 10) : 0

  return {
    ok: true,
    lint,
    typecheck,
    tests: { pass: testPass, fail: testFail },
    rebaseBase,
    overall,
    durationMs,
  }
}

/** Parse phase result from gate summary line. */
function parsePhase(summary: string, phase: string): 'pass' | 'fail' | 'skip' {
  // "lint ✓" → pass, "lint ✗" → fail, absent → skip
  const passRe = new RegExp(`${phase}[^✓✗]*✓`)
  const failRe = new RegExp(`${phase}[^✓✗]*✗`)
  if (passRe.test(summary)) return 'pass'
  if (failRe.test(summary)) return 'fail'
  return 'skip'
}

// ---------------------------------------------------------------------------
// Real deps
// ---------------------------------------------------------------------------

function realRunGate(): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bun', ['run', 'gate'], {
      cwd: ROOT,
      shell: false,
    })
    let buf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf-8')
    })
    child.stderr.on('data', (_chunk: Buffer) => {
      // swallow stderr (captured but not forwarded unless --debug)
    })
    child.on('close', (code) => {
      resolve({ stdout: buf, exitCode: code ?? 1 })
    })
    child.on('error', (err: Error) => reject(err))
  })
}

// ---------------------------------------------------------------------------
// Zero-argument in-process entry (for callers that don't need DI)
// ---------------------------------------------------------------------------

/**
 * Returns gate status using the real gate runner.
 * Intended for in-process callers (e.g. scripts/dev/check-status.ts).
 * For unit-test DI, use `getGateStatus(deps)` directly.
 */
export async function getGateStatusReal(): Promise<GateStatus | Failure> {
  return getGateStatus({
    runGate: realRunGate,
    now: () => Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const result = await getGateStatus({
    runGate: realRunGate,
    now: () => Date.now(),
  })
  printOrFail(result)
}

mainGuard(import.meta.url, main)
