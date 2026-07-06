import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Per-worker subtree root: anvil-tests/<worker-id> where worker-id is the
 * Vitest pool worker index (VITEST_POOL_ID) when running under Vitest, or the
 * process PID when called from plain Node/Bun scripts. This ensures concurrent
 * Vitest forks never share a parent directory, eliminating tmpdir races when
 * maxForks is lifted above 2.
 *
 * The global teardown (tests/global-teardown.ts) wipes the entire anvil-tests/
 * umbrella directory — that is safe because globalSetup teardown runs in the
 * main Vitest process only after all fork workers have fully exited.
 */
const WORKER_ID = process.env.VITEST_POOL_ID ?? String(process.pid)
const ROOT = join(tmpdir(), 'anvil-tests', WORKER_ID)

/**
 * Create a unique test tmpdir under /tmp/anvil-tests/<worker-id>/<purpose>-<random>/.
 * Each concurrent Vitest fork gets its own subtree so parallel workers never
 * collide. The vitest global teardown wipes the umbrella after all workers exit.
 */
export function createTestTmpDir(purpose: string): string {
  mkdirSync(ROOT, { recursive: true })
  return mkdtempSync(join(ROOT, `${purpose}-`))
}
