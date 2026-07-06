/**
 * ANV-0166 — Default-config alias resolution before capability snapshot lookup.
 *
 * Regression coverage for two doctor warnings that fired on every clean install:
 *
 *   ⚠ Capability model provenance         3 model ID(s) not in snapshot or heuristics: sonnet, haiku, opus
 *   ⚠ Capability fallback-chain coverage  1 fallback chain(s) have 0 snapshot-confirmed entries: defaults
 *
 * Root cause: `collectConfiguredModelIds()` and `collectFallbackChains()` passed
 * bare-word aliases (`sonnet`, `haiku`, `opus`) straight into `lookupCapability()`
 * without first running them through `resolveAlias()`. The bundled snapshot keys on
 * concrete IDs (`claude-sonnet-4-6` etc.), so bare aliases missed every match.
 *
 * Fix: thread `resolveAlias(id, config.model_aliases)` through both collectors.
 */

import { writeFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  pushFallbackChainCoverageCheck,
  pushModelProvenanceCheck,
} from '../../../../../src/commands/cli/doctor-checks/capability.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'
import { buildDefaultConfig } from '../../../../../src/core/config/defaults.js'
import * as capabilitySnapshot from '../../../../../src/core/models/capability-snapshot.js'
import { ModelCapabilitySnapshot } from '../../../../../src/core/types.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

/** Mirrors the three concrete IDs in `data/model-capabilities.json` so that
 *  the bare-alias resolution path can match against `snapshot` source. */
function makeBundledLikeSnapshot() {
  return ModelCapabilitySnapshot.parse({
    schema_version: 1,
    generated_at: '2026-05-14T00:00:00.000Z',
    source: 'test',
    models: [
      { id: 'claude-haiku-4-5', provider: 'anthropic' },
      { id: 'claude-sonnet-4-6', provider: 'anthropic' },
      { id: 'claude-opus-4-7', provider: 'anthropic' },
    ],
  })
}

describe('alias resolution before capability snapshot lookup', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTestTmpDir('anv-0166-test')
    vi.spyOn(capabilitySnapshot, 'loadBundledSnapshot').mockReturnValue(
      makeBundledLikeSnapshot(),
    )
  })

  afterEach(() => {
    capabilitySnapshot._resetSnapshotCache()
    vi.restoreAllMocks()
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const makeCtx = (anvilHome: string): DoctorCheckContext => ({
    cwd: '/tmp/test',
    home: '/tmp/home',
    anvilHome,
    inProject: false,
    skipDetail: 'not in project',
    installScope: 'unknown',
  })

  /** Write the default config (which uses bare aliases like `sonnet`, `haiku`,
   *  `opus` per `src/core/config/defaults.ts`) to disk. */
  function writeDefaultConfig(): void {
    const config = buildDefaultConfig()
    writeFileSync(join(tmpDir, 'models.json'), JSON.stringify(config))
  }

  it('model-provenance row passes on the default config (bare aliases resolved)', () => {
    writeDefaultConfig()
    const rows: DoctorCheckRow[] = []
    pushModelProvenanceCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    // Sanity-check: no leftover bare-alias mentions in the detail.
    expect(rows[0]?.detail).not.toMatch(/\b(sonnet|haiku|opus)\b/)
  })

  it('fallback-chain-coverage row passes on the default config (bare aliases resolved)', () => {
    writeDefaultConfig()
    const rows: DoctorCheckRow[] = []
    pushFallbackChainCoverageCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
  })

  it('bogus IDs still resolve to unknown (alias resolver returns input unchanged)', () => {
    // Use a config where `model` is a bogus concrete-looking ID that is not
    // listed in any alias map nor in the snapshot — must still warn.
    const config = buildDefaultConfig()
    config.defaults.model = 'foo-bar-baz'
    config.defaults.fallback_model = 'haiku'
    config.defaults.fallback_chain = ['foo-bar-baz']
    config.groups = {}
    config.overrides = {}
    writeFileSync(join(tmpDir, 'models.json'), JSON.stringify(config))

    const rows: DoctorCheckRow[] = []
    pushModelProvenanceCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toMatch(/foo-bar-baz/)
  })
})
