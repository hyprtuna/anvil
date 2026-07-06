/**
 * ANV-0033 — Unit tests for capability/fallback-chain-coverage doctor row.
 */

import { writeFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushFallbackChainCoverageCheck } from '../../../../../src/commands/cli/doctor-checks/capability.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'
import * as capabilitySnapshot from '../../../../../src/core/models/capability-snapshot.js'
import { ModelCapabilitySnapshot } from '../../../../../src/core/types.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

function makeSnapshot() {
  return ModelCapabilitySnapshot.parse({
    schema_version: 1,
    generated_at: '2026-05-14T00:00:00.000Z',
    source: 'test',
    models: [{ id: 'known-model-a', provider: 'anthropic' }],
  })
}

/** Minimal valid models.json with a fallback chain. */
function makeModelsJson(fallbackChain: string[]): string {
  return JSON.stringify({
    version: '1.0',
    defaults: {
      model: 'known-model-a',
      effort: 'medium',
      fallback_chain: fallbackChain,
      max_tokens: 8192,
    },
    groups: {},
    overrides: {},
    effort_levels: {
      low: { description: 'low' },
      medium: { description: 'medium' },
      high: { description: 'high' },
      xhigh: { description: 'xhigh' },
      max: { description: 'max' },
    },
    model_aliases: {
      fast: 'fast',
      balanced: 'balanced',
      powerful: 'powerful',
      default: 'balanced',
    },
  })
}

describe('capability/fallback-chain-coverage', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTestTmpDir('anv-0033-chain-test')
    vi.spyOn(capabilitySnapshot, 'loadBundledSnapshot').mockReturnValue(
      makeSnapshot(),
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

  it('emits nothing when models.json does not exist', () => {
    const rows: DoctorCheckRow[] = []
    pushFallbackChainCoverageCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(0)
  })

  it('emits nothing when no fallback chains are configured', () => {
    writeFileSync(join(tmpDir, 'models.json'), makeModelsJson([]))
    const rows: DoctorCheckRow[] = []
    pushFallbackChainCoverageCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(0)
  })

  it('emits pass when a chain has at least one snapshot-confirmed entry', () => {
    // 'known-model-a' is in the mock snapshot
    writeFileSync(
      join(tmpDir, 'models.json'),
      makeModelsJson(['known-model-a']),
    )
    const rows: DoctorCheckRow[] = []
    pushFallbackChainCoverageCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.detail).toMatch(/1 fallback chain/)
  })

  it('emits warn when a chain has zero snapshot-confirmed entries', () => {
    // 'unknown-x', 'unknown-y', 'unknown-z' are not in the mock snapshot
    writeFileSync(
      join(tmpDir, 'models.json'),
      makeModelsJson(['unknown-x', 'unknown-y', 'unknown-z']),
    )
    const rows: DoctorCheckRow[] = []
    pushFallbackChainCoverageCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toMatch(/1 fallback chain/)
    expect(rows[0]?.detail).toMatch(/defaults/)
  })
})
