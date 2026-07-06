import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SemverVersion } from './types.js'

/**
 * Marks a release slate doc as released by replacing the first
 * `Status: planned` or `Status: in-progress` line (case-insensitive)
 * with `Status: released <isoDate>`.
 *
 * Also accepts the legacy `Status: shipped` line as already-flipped — the
 * project migrated the vocabulary from `shipped` to `released` in ANV-0174;
 * old slates may still carry the legacy term.
 *
 * @param root     - absolute path to the project root
 * @param version  - release version (used to locate the slate file)
 * @param isoDate  - ISO 8601 date string (e.g. "2026-05-14")
 */
export function flipSlateStatus(
  root: string,
  version: SemverVersion,
  isoDate: string,
): void {
  const slatePath = join(root, 'docs', 'anvil', 'releases', `v${version}.md`)
  const original = readFileSync(slatePath, 'utf-8')

  // Match "Status: planned", "Status: in-progress", or "Status: in progress"
  // (case-insensitive). Both hyphen and space forms are accepted —
  // AGENTS.md release-lifecycle table documents the canonical form as
  // "in progress" (space); "in-progress" (hyphen) still appears in older slates.
  const pattern = /^(Status:\s*)(planned|in[- ]progress)$/im
  if (!pattern.test(original)) {
    // If already released (or legacy shipped), throw so callers can detect duplicate-release attempts.
    if (/^Status:\s*(released|shipped)/im.test(original)) {
      throw new Error(
        `flipSlateStatus: slate v${version}.md is already marked as released`,
      )
    }
    throw new Error(
      `flipSlateStatus: no "Status: planned" or "Status: in-progress" line found in v${version}.md`,
    )
  }

  const updated = original.replace(pattern, `$1released ${isoDate}`)
  writeFileSync(slatePath, updated, 'utf-8')
}
