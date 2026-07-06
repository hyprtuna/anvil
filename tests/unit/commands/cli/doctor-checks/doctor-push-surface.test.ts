/**
 * ANV-0223 — Doctor push-function surface guard.
 *
 * Recomputes the count of exported push-functions and push-bearing modules
 * from the live tree in `src/commands/cli/doctor-checks/` and asserts they
 * match the reconciled canonical numbers. This guard ensures the advertised
 * surface count cannot silently drift again.
 *
 * Canonical definitions (agreed in ANV-0223):
 *   - "push-function"   = line matching /^export (async )?function push/
 *   - "push-bearing module" = a .ts file in doctor-checks/ with ≥1 push-function
 *   - "total modules"   = all .ts files in doctor-checks/ (including the 4
 *                         zero-push helpers: bootstrap, live-eval, pack-collisions,
 *                         statusline)
 *
 * Reconciled numbers as of v0.18.0 tree (post-ANV-0279):
 *   - Push-functions:    77  (ANV-0279: added pushProseAiTellCheck to docs.ts;
 *                            ANV-0221: removed pushModelIdAllowlistCheck from
 *                            architecture.ts and pushModelsChecks from models.ts;
 *                            ANV-0221 follow-up: added pushUserModelAliasAdvisoryCheck
 *                            to architecture.ts — restores the lost user-config
 *                            concrete-model-ID WARN)
 *   - Push-bearing mods: 20  (docs.ts already push-bearing; architecture.ts already
 *                            push-bearing; ANV-0221: models.ts deleted)
 *   - Total .ts files:   24  (no new file added; ANV-0221: models.ts deleted)
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Reconciled push-function count as of the v0.18.0 tree (post-ANV-0279). */
const EXPECTED_PUSH_FN_COUNT = 77

/** Modules that export ≥1 push-function (denominator for "push-bearing"). */
const EXPECTED_PUSH_BEARING_MODULE_COUNT = 20

/** Total .ts files under doctor-checks/ (push-bearing + zero-push helpers). */
const EXPECTED_TOTAL_MODULE_COUNT = 24

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PUSH_FN_RE = /^export (async )?function push/m

/** Absolute path to `src/commands/cli/doctor-checks/` */
function doctorChecksDir(): string {
  // Resolve relative to this test file's location (tests/unit/commands/cli/doctor-checks/)
  // up to repo root then down to src/
  return resolve(
    import.meta.dirname,
    '../../../../..',
    'src',
    'commands',
    'cli',
    'doctor-checks',
  )
}

interface SurfaceCounts {
  totalFiles: number
  pushBearingModules: number
  totalPushFunctions: number
}

function measureSurface(): SurfaceCounts {
  const dir = doctorChecksDir()
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))

  let totalPushFunctions = 0
  let pushBearingModules = 0

  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8')
    const lines = content.split('\n')
    const pushCount = lines.filter((l) =>
      /^export (async )?function push/.test(l),
    ).length
    totalPushFunctions += pushCount
    if (pushCount > 0) pushBearingModules++
  }

  return {
    totalFiles: files.length,
    pushBearingModules,
    totalPushFunctions,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('doctor-checks push-function surface', () => {
  it('push-function count matches the reconciled canonical number', () => {
    const { totalPushFunctions } = measureSurface()
    expect(totalPushFunctions).toBe(EXPECTED_PUSH_FN_COUNT)
  })

  it('push-bearing module count matches the reconciled canonical number', () => {
    const { pushBearingModules } = measureSurface()
    expect(pushBearingModules).toBe(EXPECTED_PUSH_BEARING_MODULE_COUNT)
  })

  it('total .ts module count matches the reconciled canonical number', () => {
    const { totalFiles } = measureSurface()
    expect(totalFiles).toBe(EXPECTED_TOTAL_MODULE_COUNT)
  })

  it('zero-push modules are exactly the known helpers (bootstrap, live-eval, pack-collisions, statusline)', () => {
    const dir = doctorChecksDir()
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'))
    const zeroPush = files
      .filter((f) => {
        const content = readFileSync(join(dir, f), 'utf-8')
        return !PUSH_FN_RE.test(content)
      })
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()

    expect(zeroPush).toEqual([
      'bootstrap',
      'live-eval',
      'pack-collisions',
      'statusline',
    ])
  })
})
