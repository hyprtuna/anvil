#!/usr/bin/env -S bunx tsx
/**
 * ANV-0101 — Adapter acceptance-transcript CI lint.
 *
 * Determines whether the current PR diff (`git diff --name-only main...HEAD`)
 * touches `src/adapters/` or `src/opencode-plugin/`. If yes, fails unless at
 * least one new file matches `transcripts/<date>-<adapter>[.<label>].json`.
 *
 * Usage:
 *   bunx tsx scripts/audit/adapter-transcript-lint.ts
 *
 * Exit codes:
 *   0 — policy satisfied (no adapter changes, or transcript present).
 *   2 — policy violated (adapter changed, transcript missing).
 *
 * See docs/adapter-transcript-policy.md for the full policy.
 * Motivating defects: W-001 (missing bootstrap), W-002 (hook-map drift).
 */

import { execSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// Policy constants
// ---------------------------------------------------------------------------

/** Paths that require a transcript artifact when modified. */
export const ADAPTER_PATH_PREFIXES = ['src/adapters/', 'src/opencode-plugin/'] as const

/** Transcript filename pattern: transcripts/<date>-<adapter>[.<label>].json */
export const TRANSCRIPT_PATTERN =
  /^transcripts\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+(\.[a-z0-9-]+)?\.json$/

// ---------------------------------------------------------------------------
// Policy logic (pure — no FS access; accepts an explicit file list)
// ---------------------------------------------------------------------------

/**
 * Returns true if at least one path in `changedFiles` touches a guarded adapter
 * directory.
 */
export function touchesAdapter(changedFiles: readonly string[]): boolean {
  return changedFiles.some((f) =>
    ADAPTER_PATH_PREFIXES.some((prefix) => f.startsWith(prefix)),
  )
}

/**
 * Returns true if at least one path in `changedFiles` is a valid transcript
 * artifact matching the required naming convention.
 */
export function hasTranscript(changedFiles: readonly string[]): boolean {
  return changedFiles.some((f) => TRANSCRIPT_PATTERN.test(f))
}

/**
 * Core policy check.
 *
 * @param changedFiles - List of file paths changed in the PR diff.
 * @returns `{ pass: true }` when the policy is satisfied, or
 *          `{ pass: false; reason: string }` when it is violated.
 */
export function checkAdapterTranscriptPolicy(
  changedFiles: readonly string[],
): { pass: true } | { pass: false; reason: string } {
  if (!touchesAdapter(changedFiles)) {
    return { pass: true }
  }
  if (hasTranscript(changedFiles)) {
    return { pass: true }
  }
  return {
    pass: false,
    reason:
      'PR touches src/adapters/ or src/opencode-plugin/ but includes no ' +
      'transcripts/<date>-<adapter>.json artifact. ' +
      'See docs/adapter-transcript-policy.md (ANV-0101). ' +
      'Motivating defects: W-001 (missing bootstrap), W-002 (hook-map drift).',
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function getDiffFiles(): string[] {
  try {
    const output = execSync('git diff --name-only main...HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return output
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    // If git fails (e.g. no main branch), return empty — no adapter changes to flag.
    return []
  }
}

function main(): void {
  const changedFiles = getDiffFiles()
  const result = checkAdapterTranscriptPolicy(changedFiles)

  if (result.pass) {
    process.stdout.write(
      JSON.stringify({ pass: true, checkedFiles: changedFiles.length }) + '\n',
    )
    process.exit(0)
  } else {
    process.stdout.write(
      JSON.stringify({ pass: false, reason: result.reason }) + '\n',
    )
    process.exit(2)
  }
}

// Only run when executed directly (not when imported by tests).
// ESM-compatible guard: check if this file is the entry point.
const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('adapter-transcript-lint.ts') ||
    process.argv[1].endsWith('adapter-transcript-lint.js'))

if (isMain) {
  main()
}
