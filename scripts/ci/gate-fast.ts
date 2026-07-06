#!/usr/bin/env bun
/**
 * ANV-0220 — Fast pre-push gate (target ≤90 s on a warm machine).
 *
 * Chains lint → base → typecheck → build(cache) → test:fast in fail-fast order.
 * Identical phase ordering to the full gate, but:
 *   - build-guard uses the content-hash cache (skip when inputs unchanged)
 *   - tests run the fast tier only (`test:fast` from ANV-0218), not the full suite
 *
 * This is a developer convenience / pre-push quick-check. The full `bun run gate`
 * remains the authoritative gate wired into the git pre-push hook.
 *
 * Usage:
 *   bun run gate:fast          (via package.json script)
 *   bunx tsx scripts/ci/gate-fast.ts   (direct)
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type PhaseResult,
  computeBuildInputHash,
  formatGateSummary,
  needsRebuildByHash,
  parseVitestCounts,
} from './gate.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')
const BUILD_HASH_CACHE = join(ROOT, 'dist', '.build-hash')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a command synchronously with inherited stdio, return exit code. */
function runPhase(cmd: string, args: string[]): number {
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    cwd: ROOT,
    shell: false,
  })
  return result.status ?? 1
}

/**
 * Build guard using content-hash cache (reuses logic from gate.ts).
 * Returns 0 on cache-hit or successful build; non-zero on build failure.
 */
async function runBuildGuard(): Promise<number> {
  if (process.env.ANVIL_GATE_NO_REBUILD === '1') {
    process.stdout.write('gate:fast: build guard skipped (ANVIL_GATE_NO_REBUILD=1)\n')
    return 0
  }

  const distPath = join(ROOT, 'dist', 'index.js')
  const distExists = existsSync(distPath)
  const currentHash = computeBuildInputHash(ROOT)
  const cachedHash = existsSync(BUILD_HASH_CACHE)
    ? readFileSync(BUILD_HASH_CACHE, 'utf-8').trim()
    : undefined

  if (!needsRebuildByHash({ envOptOut: false, distExists, currentHash, cachedHash })) {
    process.stdout.write('gate:fast: build cache hit — skipping rebuild\n')
    return 0
  }

  const reason = !distExists
    ? 'gate:fast: building dist/ (dist/index.js was missing)\n'
    : cachedHash === undefined
      ? 'gate:fast: building dist/ (no build cache found)\n'
      : 'gate:fast: building dist/ (build inputs changed)\n'

  return new Promise((resolveP) => {
    process.stdout.write(reason)
    const child = spawn('bun', ['run', 'build'], {
      cwd: ROOT,
      shell: false,
    })
    child.stdout.on('data', (chunk: Buffer) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk))
    child.on('close', (code) => {
      if (code === 0) {
        try {
          writeFileSync(BUILD_HASH_CACHE, currentHash + '\n', 'utf-8')
        } catch (_err) {
          // Non-fatal — next run will just rebuild.
        }
      }
      resolveP(code ?? 1)
    })
    child.on('error', (err: Error) => {
      process.stderr.write(
        `gate:fast: failed to spawn bun run build: ${err.message}\n`,
      )
      resolveP(1)
    })
  })
}

/**
 * Run the fast test tier with tee semantics: stream to stdout in real time
 * while also capturing output for count parsing.
 */
async function runTestsFast(): Promise<{
  exitCode: number
  testCounts?: { passed: number; total: number }
}> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', 'test:fast'], {
      cwd: ROOT,
      shell: false,
    })
    let buf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk)
      buf += chunk.toString('utf-8')
    })
    child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk))
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        testCounts: parseVitestCounts(buf),
      })
    })
    child.on('error', (err: Error) => {
      process.stderr.write(`gate:fast: failed to spawn test:fast: ${err.message}\n`)
      resolve({ exitCode: 1 })
    })
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const results: PhaseResult[] = []

  // Phase 1: lint
  const lintExit = runPhase('bun', ['run', 'biome', 'check', 'src/', 'tests/'])
  results.push({ name: 'lint', ok: lintExit === 0 })
  if (lintExit !== 0) {
    process.stdout.write(`\n${formatGateSummary(results)}\n`)
    process.exit(1)
  }

  // Phase 2: base (check-rebase-base)
  const baseExit = runPhase('bunx', ['tsx', 'scripts/ci/check-rebase-base.ts'])
  results.push({ name: 'base', ok: baseExit === 0 })
  if (baseExit !== 0) {
    process.stdout.write(`\n${formatGateSummary(results)}\n`)
    process.exit(1)
  }

  // Phase 3: typecheck
  const tcExit = runPhase('bun', ['run', 'tsc', '--noEmit'])
  results.push({ name: 'typecheck', ok: tcExit === 0 })
  if (tcExit !== 0) {
    process.stdout.write(`\n${formatGateSummary(results)}\n`)
    process.exit(1)
  }

  // Phase 3.5: build guard (content-hash cache — ANV-0220)
  const buildGuardExit = await runBuildGuard()
  if (buildGuardExit !== 0) {
    process.stdout.write('\ngate:fast: build failed — aborting before tests\n')
    process.exit(1)
  }

  // Phase 4: fast test tier (ANV-0218)
  const { exitCode: testExit, testCounts } = await runTestsFast()
  results.push({ name: 'tests', ok: testExit === 0, testCounts })
  process.stdout.write(`\n${formatGateSummary(results)}\n`)

  if (testExit !== 0) {
    process.exit(1)
  }
  process.exit(0)
}

// Only run when executed directly (not imported by tests).
const moduleFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (moduleFile === entryFile) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `gate:fast error: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
