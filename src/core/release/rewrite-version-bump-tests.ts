import { writeFileSync as defaultWriteFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  emitHistoricalAntiStaleTest,
  emitPositiveAssertionTest,
} from './emit-version-bump-tests.js'
import type { SemverVersion } from './types.js'

/**
 * Atomically rewrite the version-bump test files for a release.
 *
 * CRITICAL ordering rule (load-bearing — fixes the PR #69 footgun):
 *   1. writeFile(newPath)  — new test for `to` is written FIRST.
 *   2. writeFile(oldPath)  — old test for `from` is overwritten SECOND.
 *
 * This order is intentional. Never use fs.renameSync or git mv here because
 * those operations are two separate actions (rename + edit), which means the
 * content edit can be forgotten if the process is interrupted after rename.
 * Using two explicit writeFile calls makes the atomic-content-update
 * visible as two file writes (both staged together), not a rename + edit.
 *
 * @param root      - absolute path to the project root
 * @param from      - previous (old) version
 * @param to        - new (target) version
 * @param writeFile - injectable write function (default: fs.writeFileSync).
 *                    Override in tests to verify call order without mocking node:fs.
 */
export function rewriteVersionBumpTests(
  root: string,
  from: SemverVersion,
  to: SemverVersion,
  writeFile: (
    path: string,
    content: string,
    encoding: BufferEncoding,
  ) => void = defaultWriteFileSync,
): void {
  const testDir = join(root, 'tests', 'unit', 'release')

  const newPath = join(testDir, `version-bump-v${to}.test.ts`)
  const oldPath = join(testDir, `version-bump-v${from}.test.ts`)

  // Step 1: write new positive-assertion test file FIRST.
  writeFile(newPath, emitPositiveAssertionTest(to, from), 'utf-8')

  // Step 2: overwrite old test file with the historical anti-stale version SECOND.
  writeFile(oldPath, emitHistoricalAntiStaleTest(to, from), 'utf-8')
}
