/**
 * ANV-0156 — branch-state helper.
 *
 * Emits a single JSON object to stdout:
 *   BranchState { ok, branch, base, ahead, behind, dirty, untracked,
 *                 lastCommitSha, lastCommitSubject }
 *
 * Exit 0 on success, exit 2 on failure (with { ok: false, error }).
 * Never writes to stderr unless --debug is passed.
 *
 * Usage:
 *   bunx tsx scripts/agent/branch-state.ts | jq .
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deriveReleaseBranch } from '../../src/core/rebase-guard/index.js'
import {
  type Failure,
  ROOT,
  type RunGit,
  mainGuard,
  parseGitPorcelain,
  printOrFail,
  runGit as realRunGit,
} from './_lib.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BranchState {
  ok: true
  branch: string
  base: string
  ahead: number
  behind: number
  dirty: boolean
  untracked: boolean
  lastCommitSha: string
  lastCommitSubject: string
}

// ---------------------------------------------------------------------------
// Core logic (dependency-injected for unit tests)
// ---------------------------------------------------------------------------

export function getBranchState(runGit: RunGit): BranchState | Failure {
  // 1. Current branch
  let branch: string
  try {
    branch = runGit('rev-parse', '--abbrev-ref', 'HEAD').trim()
  } catch (e) {
    return {
      ok: false,
      error: `could not determine current branch: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // 2. Derive base/release branch from package.json version
  let base: string
  try {
    const pkgRaw = readFileSync(join(ROOT, 'package.json'), 'utf-8')
    const pkg = JSON.parse(pkgRaw) as { version?: string }
    const envOverride = process.env.ANVIL_RELEASE_BRANCH
    base = deriveReleaseBranch(pkg.version ?? '0.0.0', envOverride)
  } catch {
    base = 'main'
  }

  // 3. Ahead/behind relative to base
  let ahead = 0
  let behind = 0
  try {
    const raw = runGit(
      'rev-list',
      '--count',
      '--left-right',
      `${base}...HEAD`,
    ).trim()
    const parts = raw.split('\t')
    behind = Number.parseInt(parts[0] ?? '0', 10)
    ahead = Number.parseInt(parts[1] ?? '0', 10)
    if (!Number.isFinite(behind)) behind = 0
    if (!Number.isFinite(ahead)) ahead = 0
  } catch {
    // base branch may not exist locally — leave counts at 0
  }

  // 4. Dirty / untracked
  let dirty = false
  let untracked = false
  try {
    const porcelain = runGit('status', '--porcelain=v1')
    const entries = parseGitPorcelain(porcelain)
    dirty = entries.some((e) => e.xy !== '??' && e.xy.trim() !== '')
    untracked = entries.some((e) => e.xy === '??')
  } catch {
    // ignore; leave as false
  }

  // 5. Last commit
  let lastCommitSha = ''
  let lastCommitSubject = ''
  try {
    lastCommitSha = runGit('rev-parse', '--short', 'HEAD').trim()
    lastCommitSubject = runGit('log', '-1', '--format=%s').trim()
  } catch {
    // ignore
  }

  return {
    ok: true,
    branch,
    base,
    ahead,
    behind,
    dirty,
    untracked,
    lastCommitSha,
    lastCommitSubject,
  }
}

// ---------------------------------------------------------------------------
// Zero-argument in-process entry (for callers that don't need DI)
// ---------------------------------------------------------------------------

/**
 * Returns the current branch state using the real git runner.
 * Intended for in-process callers (e.g. scripts/dev/check-status.ts).
 * For unit-test DI, use `getBranchState(mockRunGit)` directly.
 */
export function getBranchStateReal(): BranchState | Failure {
  return getBranchState(realRunGit)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const result = getBranchState(realRunGit)
  printOrFail(result)
}

mainGuard(import.meta.url, main)
