import { execSync } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '../../src/core/config/defaults.js'
import { createTestTmpDir } from '../helpers/tmpdir.js'

const ROOT = process.cwd()
const DIST = join(ROOT, 'dist-hooks')

describe('bundled hooks are free of runtime-undefined references', () => {
  // Use an isolated tmpdir as the hook's cwd so the test does not depend
  // on whatever installed `.anvil/models.json` happens to live above the
  // current working tree (post-A0, that file may use the old schema if
  // the user has not re-installed Anvil yet).
  let fixtureDir: string

  beforeAll(() => {
    if (!existsSync(join(DIST, 'session-start.cjs'))) {
      execSync('node scripts/build-hooks.mjs', { cwd: ROOT, stdio: 'pipe' })
    }
    fixtureDir = createTestTmpDir('hooks-test')
    // Drop a current-schema models.json so the hook config loader sees a valid file.
    const anvilDir = join(fixtureDir, '.anvil')
    execSync(`mkdir -p ${anvilDir}`)
    writeFileSync(
      join(anvilDir, 'models.json'),
      `${JSON.stringify(buildDefaultConfig(), null, 2)}\n`,
    )
  }, 120_000)

  afterAll(() => {
    if (fixtureDir) rmSync(fixtureDir, { recursive: true, force: true })
  })

  it('every bundled hook resolves its handler at build time, not runtime', () => {
    const files = readdirSync(DIST).filter((f) => f.endsWith('.cjs'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(DIST, f), 'utf8')
      // The shim must not leak a runtime lookup like `${kind.replace(...)}Handler`.
      expect(src).not.toMatch(/kind\.replace\(/)
    }
  })

  it('session-start.cjs runs end-to-end on resume payload', () => {
    const payload = JSON.stringify({
      session_id: 't',
      transcript_path: '/tmp/x',
      cwd: fixtureDir,
      hook_event_name: 'SessionStart',
      source: 'resume',
    })
    // Override HOME so the hook reads the fixture's models.json instead
    // of whatever happens to live in the user's installed `~/.anvil/`.
    // The entrypoint at `src/hooks/entrypoint.ts` resolves config via
    // `homedir()`; redirecting HOME isolates the test from ambient state.
    const out = execSync(
      `echo '${payload}' | HOME=${fixtureDir} node ${join(DIST, 'session-start.cjs')}`,
      { shell: '/bin/bash', encoding: 'utf8' },
    )
    expect(out).not.toMatch(/ReferenceError/)
    expect(out).not.toMatch(/is not defined/)
  })
})
