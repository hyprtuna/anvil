import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SemverVersion } from './types.js'

/**
 * Rewrite the `"version"` field in package.json and marketplace.json
 * from `from` to `to`.
 *
 * Preserves file formatting by doing a targeted string replacement rather
 * than JSON.parse + JSON.stringify (which loses trailing newlines and
 * may alter indent style).
 *
 * @param root - absolute path to the project root
 * @param from - current version (used to construct the replacement pattern)
 * @param to   - target version
 */
export function bumpVersionFiles(
  root: string,
  from: SemverVersion,
  to: SemverVersion,
): void {
  for (const filename of ['package.json', 'marketplace.json']) {
    const filePath = join(root, filename)
    const original = readFileSync(filePath, 'utf-8')
    // Replace the first occurrence of "version": "<from>" with "version": "<to>"
    // Anchored to the exact version string to avoid false-positive replacements.
    const pattern = new RegExp(`("version":\\s*)"${escapeRegex(from)}"`)
    const updated = original.replace(pattern, `$1"${to}"`)
    if (updated === original) {
      throw new Error(
        `bumpVersionFiles: could not find "version": "${from}" in ${filename}`,
      )
    }
    writeFileSync(filePath, updated, 'utf-8')
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
