/**
 * ANV-0156 — Shared helpers for scripts/agent/* JSON status helpers.
 *
 * Exports:
 *   ROOT            — absolute repo root derived from this file's location
 *   runGit          — spawnSync-based git runner, returns stdout string
 *   runProcess      — spawnSync-based generic runner, returns RunResult
 *   mainGuard       — canonical ESM main-guard (anti-fork-bomb pattern)
 *   printOrFail     — emit JSON to stdout + exit
 *   parseGitPorcelain — parse `git status --porcelain=v1` output
 *   Failure         — type for { ok: false, error: string }
 */

import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

/** Absolute path to the repo root (three levels up from scripts/agent/_lib.ts). */
export const ROOT: string = join(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Failure {
  ok: false
  error: string
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

/** Signature for the injected git runner (enables DI in tests). */
export type RunGit = (...args: string[]) => string

/** Signature for the injected process runner (enables DI in tests). */
export type RunProcess = (
  cmd: string,
  args: string[],
  cwd?: string,
) => RunResult

// ---------------------------------------------------------------------------
// git runner
// ---------------------------------------------------------------------------

const DEBUG = process.argv.includes('--debug')

/**
 * Run a git subcommand synchronously.
 * Returns trimmed stdout.
 * Throws with the captured stderr on non-zero exit.
 * Captured stderr is only written to process.stderr when --debug is passed.
 */
export function runGit(...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    shell: false,
    encoding: 'utf-8',
  })
  if (DEBUG && result.stderr) {
    process.stderr.write(result.stderr)
  }
  if (result.status !== 0) {
    const msg =
      (result.stderr ?? '').trim() || `git ${args[0]} exited ${result.status}`
    throw new Error(msg)
  }
  // Do NOT trim: some commands (e.g. git status --porcelain) have significant
  // leading whitespace. Callers that want trimmed output call .trim() themselves.
  return result.stdout ?? ''
}

// ---------------------------------------------------------------------------
// process runner
// ---------------------------------------------------------------------------

/**
 * Run any command synchronously with spawnSync(shell: false).
 * Returns { stdout, stderr, exitCode }.
 * Captured stderr is only written to process.stderr when --debug is passed.
 */
export function runProcess(
  cmd: string,
  args: string[],
  cwd: string = ROOT,
): RunResult {
  const result = spawnSync(cmd, args, {
    cwd,
    shell: false,
    encoding: 'utf-8',
  })
  const stderr = (result.stderr ?? '').toString()
  const stdout = (result.stdout ?? '').toString()
  if (DEBUG && stderr) {
    process.stderr.write(stderr)
  }
  return {
    stdout,
    stderr,
    exitCode: result.status ?? 1,
  }
}

// ---------------------------------------------------------------------------
// Main guard (canonical, post-fork-bomb pattern)
// ---------------------------------------------------------------------------

/**
 * Canonical ESM main-guard.
 *
 * Call at the bottom of every scripts/agent/*.ts:
 *   mainGuard(import.meta.url, main)
 *
 * Uses an exact absolute-path comparison between the module's URL and the
 * resolved process.argv[1] entry point. This is the ONLY correct guard —
 * the substring-includes antipattern (v0.13.3 fork-bomb) is explicitly
 * banned by no-substring-mainguard.test.ts.
 */
export function mainGuard(
  importMetaUrl: string,
  fn: () => Promise<void>,
): void {
  const moduleFile = fileURLToPath(importMetaUrl)
  const entryFile = process.argv[1] ? resolve(process.argv[1]) : ''
  if (moduleFile === entryFile) {
    fn().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      const failure: Failure = { ok: false, error: msg }
      process.stdout.write(`${JSON.stringify(failure)}\n`)
      process.exit(2)
    })
  }
}

// ---------------------------------------------------------------------------
// printOrFail
// ---------------------------------------------------------------------------

/**
 * Emit a single JSON object to stdout then exit.
 *
 * On success:  printOrFail({ ok: true, ...data }) → exit 0
 * On failure:  printOrFail({ ok: false, error: '...' }) → exit 2
 */
export function printOrFail(value: unknown): never {
  process.stdout.write(`${JSON.stringify(value)}\n`)
  const v = value as Record<string, unknown>
  process.exit(v.ok === false ? 2 : 0)
}

// ---------------------------------------------------------------------------
// parseGitPorcelain
// ---------------------------------------------------------------------------

export interface PorcelainEntry {
  xy: string
  path: string
  origPath?: string
}

/**
 * Parse the output of `git status --porcelain=v1`.
 *
 * Each line is "XY path" or "XY orig -> path" (renames).
 * Returns an array of { xy, path, origPath? } entries.
 */
export function parseGitPorcelain(output: string): PorcelainEntry[] {
  if (!output.trim()) return []
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const xy = line.slice(0, 2)
      const rest = line.slice(3)
      // Rename: "R  orig -> dest" in porcelain v1
      const arrow = rest.indexOf(' -> ')
      if (arrow !== -1) {
        return {
          xy,
          path: rest.slice(arrow + 4),
          origPath: rest.slice(0, arrow),
        }
      }
      return { xy, path: rest }
    })
}
