#!/usr/bin/env bun
/**
 * ANV-0153 — Unified pre-push gate runner.
 *
 * Chains lint → base → typecheck → build-guard → tests in fail-fast order.
 * Phase ordering rationale (differs from the original ANV-0152 prose of
 * check-rebase-base → lint → test → typecheck):
 *
 *   1. lint       — cheapest possible check; catches style and syntax problems
 *                   in <2 s. Fail-fast here saves all downstream time.
 *   2. base       — fast git fork-point check; prevents silent-revert failures.
 *                   Still <1 s but requires a git round-trip, so placed after
 *                   lint.
 *   3. typecheck  — medium cost (~5 s); must pass before running tests is
 *                   meaningful (type errors produce false test failures).
 *   4. build-guard — (ANV-0162) rebuilds dist/ when dist/index.js is missing
 *                   or any src/**\/*.ts is newer. Skipped via
 *                   ANVIL_GATE_NO_REBUILD=1. Runs after typecheck so a failing
 *                   typecheck still short-circuits before the build.
 *   5. tests      — most expensive phase; runs last so earlier cheaper checks
 *                   catch the common failure modes first.
 *
 * Export surface:
 *   - PhaseResult     (interface)
 *   - formatGateSummary(results: PhaseResult[]): string   — pure, testable
 *   - parseVitestCounts(output: string): { passed: number; total: number } | undefined  — pure, testable
 *   - needsRebuild(opts: NeedsRebuildOpts): boolean       — pure, testable (ANV-0162, mtime-based)
 *   - NeedsRebuildByHashOpts (interface)
 *   - needsRebuildByHash(opts: NeedsRebuildByHashOpts): boolean — pure, testable (ANV-0220, content-hash)
 *   - computeBuildInputHash(root: string): string         — hashes all build inputs
 *
 * The main() function is only invoked when the script is executed directly.
 *
 * Usage:
 *   bun run gate           (via package.json script)
 *   bunx tsx scripts/ci/gate.ts   (direct)
 */

import { createHash } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PhaseResult {
  name: 'lint' | 'base' | 'typecheck' | 'tests'
  ok: boolean
  testCounts?: { passed: number; total: number }
}

// ---------------------------------------------------------------------------
// Pure: needsRebuild (ANV-0162)
// ---------------------------------------------------------------------------

/**
 * Options for the `needsRebuild` pure decision function.
 *
 * All filesystem state is passed in as plain values so the function stays
 * testable without any real I/O.
 */
export interface NeedsRebuildOpts {
  /** Whether the ANVIL_GATE_NO_REBUILD env var is set to "1". */
  envOptOut: boolean
  /** Whether dist/index.js currently exists on disk. */
  distExists: boolean
  /** mtime (ms since epoch) of dist/index.js, or undefined when absent. */
  distMtime: number | undefined
  /** mtime values for every src/**\/*.ts file. */
  srcMtimes: number[]
}

/**
 * Returns true when `bun run build` should be executed before running tests.
 *
 * Decision table:
 *   - envOptOut = true          → false  (CI opt-out)
 *   - distExists = false        → true   (dist missing)
 *   - any srcMtime > distMtime  → true   (source newer than dist)
 *   - otherwise                 → false  (dist is fresh)
 */
export function needsRebuild(opts: NeedsRebuildOpts): boolean {
  if (opts.envOptOut) return false
  if (!opts.distExists || opts.distMtime === undefined) return true
  return opts.srcMtimes.some((mt) => mt > opts.distMtime!)
}

// ---------------------------------------------------------------------------
// Pure: needsRebuildByHash (ANV-0220)
// ---------------------------------------------------------------------------

/**
 * Options for the `needsRebuildByHash` pure decision function.
 *
 * All state is passed in as plain values so the function stays testable without
 * any real I/O.
 */
export interface NeedsRebuildByHashOpts {
  /** Whether the ANVIL_GATE_NO_REBUILD env var is set to "1". */
  envOptOut: boolean
  /** Whether dist/index.js currently exists on disk. */
  distExists: boolean
  /** SHA-256 hex digest of the current build inputs (src + scripts + tsconfig). */
  currentHash: string
  /** SHA-256 hex digest persisted from the last successful build, or undefined
   *  when no cache file exists yet. */
  cachedHash: string | undefined
}

/**
 * Returns true when `bun run build` should be executed.
 *
 * Decision table:
 *   - envOptOut = true                  → false  (hard opt-out)
 *   - distExists = false                → true   (dist missing)
 *   - cachedHash is undefined           → true   (no cache — first run)
 *   - currentHash !== cachedHash        → true   (inputs changed)
 *   - currentHash === cachedHash        → false  (cache hit — skip build)
 */
export function needsRebuildByHash(opts: NeedsRebuildByHashOpts): boolean {
  if (opts.envOptOut) return false
  if (!opts.distExists) return true
  if (opts.cachedHash === undefined) return true
  return opts.currentHash !== opts.cachedHash
}

// ---------------------------------------------------------------------------
// Shared constants (used by both pure and I/O helpers below)
// ---------------------------------------------------------------------------

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', '..')

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.anvil', '.claude'])

// ---------------------------------------------------------------------------
// I/O helper: computeBuildInputHash (ANV-0220)
// ---------------------------------------------------------------------------

/**
 * Recursively collects the contents of every `*.ts` file under `dir` into the
 * provided hash. Skips SKIP_DIRS to avoid hashing generated/external artefacts.
 */
function hashSrcFiles(dir: string, hash: ReturnType<typeof createHash>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      hashSrcFiles(full, hash)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      // Include the relative path so a rename invalidates the cache.
      hash.update(full)
      hash.update(readFileSync(full))
    }
  }
}

/**
 * Recursively collects the contents of EVERY file under `dir` (regardless of
 * extension) into the provided hash. Skips SKIP_DIRS. Used for `data/`, where
 * any file (e.g. model-capabilities.json) is a build input copied into dist/.
 */
function hashAllFiles(dir: string, hash: ReturnType<typeof createHash>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      hashAllFiles(full, hash)
    } else if (entry.isFile()) {
      // Include the relative path so a rename invalidates the cache.
      hash.update(full)
      hash.update(readFileSync(full))
    }
  }
}

/**
 * Computes a SHA-256 hex digest over all build inputs:
 *   - Every `*.ts` file under `<root>/src/` (contents + path)
 *   - Every file under `<root>/data/` (contents + path) — the build copies
 *     data/model-capabilities.json into dist/data/ (build-bundle.mjs), so a
 *     change there must invalidate the cache (ANV-0220 review fix).
 *   - Every *.mjs and *.ts file under scripts/build* (top-level build scripts)
 *   - `<root>/tsconfig.json` and `<root>/tsconfig.base.json` (if present)
 *   - The 'build' script string from `<root>/package.json`
 *   - The lockfile (`bun.lockb` or `bun.lock`, if present) — a dependency
 *     change alters the bundled output (ANV-0220 review fix).
 *
 * Exported so callers (gate-fast.ts) can reuse it without re-implementing the
 * file-walking logic.
 */
export function computeBuildInputHash(root: string): string {
  const hash = createHash('sha256')

  // 1. All TypeScript source files.
  const srcDir = join(root, 'src')
  if (existsSync(srcDir)) hashSrcFiles(srcDir, hash)

  // 1b. All data files (build copies data/model-capabilities.json → dist/data/).
  const dataDir = join(root, 'data')
  if (existsSync(dataDir)) hashAllFiles(dataDir, hash)

  // 2. Build scripts (scripts/build*.mjs, scripts/ci/gate.ts itself).
  const scriptsDir = join(root, 'scripts')
  if (existsSync(scriptsDir)) {
    for (const entry of readdirSync(scriptsDir, { withFileTypes: true })) {
      if (
        entry.isFile() &&
        (entry.name.startsWith('build') || entry.name.startsWith('Build')) &&
        (entry.name.endsWith('.mjs') || entry.name.endsWith('.ts'))
      ) {
        const full = join(scriptsDir, entry.name)
        hash.update(full)
        hash.update(readFileSync(full))
      }
    }
  }

  // 3. tsconfig files (control tsc compilation).
  for (const name of ['tsconfig.json', 'tsconfig.base.json', 'tsconfig.build.json']) {
    const p = join(root, name)
    if (existsSync(p)) {
      hash.update(name)
      hash.update(readFileSync(p))
    }
  }

  // 4. The "build" script in package.json (a change there changes the build).
  const pkgPath = join(root, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
      const scripts = pkg['scripts'] as Record<string, unknown> | undefined
      if (scripts) {
        const buildScript = scripts['build']
        if (typeof buildScript === 'string') {
          hash.update('package.json:scripts.build')
          hash.update(buildScript)
        }
      }
    } catch (_err) {
      // Malformed package.json — continue with what we have.
    }
  }

  // 5. Lockfile — a dependency change alters the bundled output. Bun emits
  //    `bun.lockb` (binary) or `bun.lock` (text) depending on version/config.
  for (const name of ['bun.lockb', 'bun.lock']) {
    const p = join(root, name)
    if (existsSync(p)) {
      hash.update(name)
      hash.update(readFileSync(p))
    }
  }

  return hash.digest('hex')
}

// ---------------------------------------------------------------------------
// Pure: formatGateSummary
// ---------------------------------------------------------------------------

/**
 * Formats the gate result into a single summary line.
 *
 * On success (all phases ran and passed):
 *   gate: lint ✓  base ✓  typecheck ✓  tests 4765/4775 ✓
 *
 * On failure (fail-fast — last ran phase marked ✗, unrun phases omitted):
 *   gate: lint ✓  base ✗
 */
export function formatGateSummary(results: PhaseResult[]): string {
  const parts = results.map((r) => {
    const mark = r.ok ? '✓' : '✗'
    if (r.name === 'tests' && r.testCounts !== undefined) {
      return `tests ${r.testCounts.passed}/${r.testCounts.total} ${mark}`
    }
    return `${r.name} ${mark}`
  })
  return `gate: ${parts.join('  ')}`
}

// ---------------------------------------------------------------------------
// Pure: parseVitestCounts
// ---------------------------------------------------------------------------

/**
 * Parses a vitest summary line from captured stdout and returns the passed and
 * total test counts.
 *
 * Vitest v1 emits lines like:
 *   Tests  4784 passed | 10 skipped (4794)
 *   Tests  4794 passed (4794)
 *   Tests  3 failed | 4781 passed | 10 skipped (4794)
 *
 * The regex anchors on `passed` and tolerates any `| N <label>` suffixes
 * before the totals parenthetical.
 *
 * Returns undefined when no matching line is found (never throws).
 */
export function parseVitestCounts(
  output: string,
): { passed: number; total: number } | undefined {
  const match = output.match(/Tests[^\n]*\b(\d+)\s+passed[^()\n]*\((\d+)\)/)
  if (!match) return undefined
  return {
    passed: Number.parseInt(match[1], 10),
    total: Number.parseInt(match[2], 10),
  }
}

// ---------------------------------------------------------------------------
// Internal: phase runners (side-effectful, not exported)
// ---------------------------------------------------------------------------

/**
 * Recursively collects mtime (ms) for every *.ts file under `dir`.
 * Uses only node:fs — no new runtime dependencies.
 * Skips SKIP_DIRS to protect against future nesting under src/.
 */
function collectSrcMtimes(dir: string): number[] {
  const mtimes: number[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      mtimes.push(...collectSrcMtimes(full))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      mtimes.push(statSync(full).mtimeMs)
    }
  }
  return mtimes
}

/** Path of the build-hash cache file (inside dist/ which is gitignored). */
const BUILD_HASH_CACHE = join(ROOT, 'dist', '.build-hash')

/**
 * Build guard (ANV-0220): rebuilds dist/ when dist/index.js is missing or the
 * content-hash of all build inputs differs from the cached digest. Skipped when
 * ANVIL_GATE_NO_REBUILD=1. Returns exit code: 0 = ok (cache-hit or rebuild
 * succeeded), non-zero = rebuild failed.
 *
 * Cache file: dist/.build-hash — a SHA-256 hex digest written after a
 * successful build.  dist/ is already gitignored; the cache file rides along.
 */
async function runBuildGuard(): Promise<number> {
  if (process.env.ANVIL_GATE_NO_REBUILD === '1') {
    process.stdout.write('gate: build guard skipped (ANVIL_GATE_NO_REBUILD=1)\n')
    return 0
  }

  const distPath = join(ROOT, 'dist', 'index.js')
  const distExists = existsSync(distPath)
  const currentHash = computeBuildInputHash(ROOT)
  const cachedHash = existsSync(BUILD_HASH_CACHE)
    ? readFileSync(BUILD_HASH_CACHE, 'utf-8').trim()
    : undefined

  if (!needsRebuildByHash({ envOptOut: false, distExists, currentHash, cachedHash })) {
    process.stdout.write('gate: build cache hit — skipping rebuild\n')
    return 0
  }

  const reason = !distExists
    ? 'gate: building dist/ (dist/index.js was missing)\n'
    : cachedHash === undefined
      ? 'gate: building dist/ (no build cache found)\n'
      : 'gate: building dist/ (build inputs changed)\n'

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
        // Persist the digest only on success so a failed build always retries.
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
        `gate: failed to spawn bun run build: ${err.message}\n`,
      )
      resolveP(1)
    })
  })
}

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
 * Run vitest with tee semantics: stream to stdout in real time while also
 * capturing output so we can parse the test count summary line.
 *
 * Uses async spawn() + a stdout 'data' listener that tees each chunk to both
 * process.stdout (immediate, user-visible) and an internal buffer (for
 * parseVitestCounts). This avoids the ~30s black-screen that spawnSync caused
 * by buffering all output until the child exited.
 *
 * Falls back to testCounts: undefined if parsing fails (never blocks).
 */
async function runTests(): Promise<{
  exitCode: number
  testCounts?: { passed: number; total: number }
}> {
  return new Promise((resolve) => {
    const child = spawn('bun', ['run', 'vitest', 'run'], {
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
      process.stderr.write(`gate: failed to spawn vitest: ${err.message}\n`)
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

  // Phase 3.5: build guard (ANV-0162) — runs after typecheck so a failing
  // typecheck short-circuits before a potentially expensive build.
  const buildGuardExit = await runBuildGuard()
  if (buildGuardExit !== 0) {
    process.stdout.write('\ngate: build failed — aborting before tests\n')
    process.exit(1)
  }

  // Phase 4: tests (with tee-capture for count parsing)
  const { exitCode: testExit, testCounts } = await runTests()
  results.push({ name: 'tests', ok: testExit === 0, testCounts })
  process.stdout.write(`\n${formatGateSummary(results)}\n`)

  if (testExit !== 0) {
    process.exit(1)
  }
  process.exit(0)
}

// Only run when executed directly (not imported by tests).
//
// The previous guard `process.argv[1]?.includes('gate')` was buggy: when vitest
// runs tests/unit/scripts/gate-summary.test.ts, argv[1] is that test path,
// which also contains the substring 'gate' — so importing this module from the
// test triggered main(), which spawned `bun run vitest run` as phase 4, which
// re-ran the same test, which re-imported this module, which spawned vitest
// again. Fork bomb. The fix is an exact absolute-path match between the
// running module's URL and the resolved entry point.
const moduleFile = fileURLToPath(import.meta.url)
const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
if (moduleFile === entryFile) {
  main().catch((err: unknown) => {
    process.stderr.write(
      `gate error: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exit(1)
  })
}
