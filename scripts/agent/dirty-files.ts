/**
 * ANV-0156 — dirty-files helper.
 *
 * Emits a single JSON object to stdout:
 *   DirtyFiles { ok, modified: string[], staged: string[], untracked: string[] }
 *
 * Exit 0 on success, exit 2 on failure (with { ok: false, error }).
 * Never writes to stderr unless --debug is passed.
 *
 * Usage:
 *   bunx tsx scripts/agent/dirty-files.ts | jq .
 */

import {
  type Failure,
  type RunGit,
  mainGuard,
  parseGitPorcelain,
  printOrFail,
  runGit as realRunGit,
} from './_lib.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DirtyFiles {
  ok: true
  modified: string[]
  staged: string[]
  untracked: string[]
}

// ---------------------------------------------------------------------------
// Core logic (dependency-injected for unit tests)
// ---------------------------------------------------------------------------

export function getDirtyFiles(runGit: RunGit): DirtyFiles | Failure {
  let porcelain: string
  try {
    porcelain = runGit('status', '--porcelain=v1')
  } catch (e) {
    return {
      ok: false,
      error: `git status failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const entries = parseGitPorcelain(porcelain)

  // X = index (staged), Y = worktree (unstaged/modified)
  // XY semantics:
  //   X != ' ' && X != '?' → staged change
  //   Y != ' ' && Y != '?' → worktree change (modified)
  //   XY == '??' → untracked

  const modified: string[] = []
  const staged: string[] = []
  const untracked: string[] = []

  for (const entry of entries) {
    const x = entry.xy[0] ?? ' '
    const y = entry.xy[1] ?? ' '

    if (entry.xy === '??') {
      untracked.push(entry.path)
    } else {
      if (x !== ' ') staged.push(entry.path)
      if (y !== ' ') modified.push(entry.path)
    }
  }

  return { ok: true, modified, staged, untracked }
}

// ---------------------------------------------------------------------------
// Zero-argument in-process entry (for callers that don't need DI)
// ---------------------------------------------------------------------------

/**
 * Returns dirty files using the real git runner.
 * Intended for in-process callers (e.g. scripts/dev/check-status.ts).
 * For unit-test DI, use `getDirtyFiles(mockRunGit)` directly.
 */
export function getDirtyFilesReal(): DirtyFiles | Failure {
  return getDirtyFiles(realRunGit)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const result = getDirtyFiles(realRunGit)
  printOrFail(result)
}

mainGuard(import.meta.url, main)
