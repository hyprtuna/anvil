import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Named teardown export — vitest globalSetup files support { setup?, teardown? }.
 * A default-export function is treated as the setup function, not teardown.
 * We only need teardown here (no setup), so we use the named export form.
 *
 * Safety guarantee: globalSetup teardown runs in the main Vitest orchestrator
 * process, and Vitest guarantees all fork workers have fully exited before
 * teardown is invoked. It is therefore safe to wipe the entire anvil-tests/
 * umbrella directory here — no live worker subtree can be in flight at this
 * point. Individual workers each write into anvil-tests/<VITEST_POOL_ID>/ (see
 * tests/helpers/tmpdir.ts) which provides isolation DURING the run; this
 * teardown cleans up all of them at once when the run is complete.
 */
export function teardown() {
  rmSync(join(tmpdir(), 'anvil-tests'), { recursive: true, force: true })
}
