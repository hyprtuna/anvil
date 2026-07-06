/**
 * ANV-0160 Fix A — Global $HOME isolation for every vitest fork.
 *
 * Each fork gets its own tmpdir-rooted $HOME so that test code calling
 * homedir() (via src/hooks/dispatcher.ts:567-574, wrap.ts:192-210,
 * doctor.ts, installer, etc.) writes to an isolated tree instead of the
 * developer's real ~/.anvil/.
 *
 * Design notes:
 *   - beforeAll / afterAll run once per fork (pool: 'forks' in vitest.config.ts).
 *   - PID suffix makes the temp-dir name human-readable in debug sessions.
 *   - Existing per-test process.env.HOME overrides still work: they nest
 *     inside this outer override and restore correctly.
 *   - Tests that depend on real ~/.anvil/ content must seed the isolated home.
 *     See triage classes in .anvil/specs/features/anv-0160-test-env-determinism/plan.md.
 *
 * REVERT-BUNDLE: This file and its triage commits (if any) form a logical
 * bundle. To revert, use:
 *   git revert <this-commit-sha>..<last-triage-sha>
 */

import { rmSync } from 'node:fs'
import { afterAll, beforeAll } from 'vitest'
import { createTestTmpDir } from './helpers/tmpdir.js'

// v0.18.0 release-gate fix — scrub inherited git environment.
//
// When the suite runs from inside a git hook (the `pre-push` hook runs
// `bun run gate`), git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE / etc.
// into the hook's environment. Those leak into the test workers and break every
// git-dependent test (cli-worktree, cli-projects, preferences.deriveProjectName,
// project/root worktree detection, project-root-derived hook state) because git
// commands in tmp repos resolve against the leaked GIT_DIR instead of normal
// discovery. The gate is green in a plain shell but fails ~21-33 tests under the
// hook. Deleting these at setup makes the suite hermetic regardless of how it was
// invoked. Module top-level so it applies before any test in the fork.
//
// (This also prevents the GIT_INDEX_FILE contamination that wiped the index
// during v0.18.0's own ship — see the recovery commit in this release.)
for (const k of [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_PREFIX',
  'GIT_COMMON_DIR',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_NAMESPACE',
  'GIT_CEILING_DIRECTORIES',
]) {
  // biome-ignore lint/performance/noDelete: must remove the key entirely; assigning undefined leaves it as the string "undefined" and still misleads git.
  delete process.env[k]
}

let fakeHome: string
let origHome: string | undefined

beforeAll(() => {
  origHome = process.env.HOME
  fakeHome = createTestTmpDir(`vitest-home-${process.pid}`)
  process.env.HOME = fakeHome
})

afterAll(() => {
  if (origHome !== undefined) {
    process.env.HOME = origHome
  } else {
    // biome-ignore lint/performance/noDelete: assigning undefined would leave HOME as the string "undefined"; deletion faithfully restores the absent-key state.
    delete process.env.HOME
  }
  rmSync(fakeHome, { recursive: true, force: true })
})
