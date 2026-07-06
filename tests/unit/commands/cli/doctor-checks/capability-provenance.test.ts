/**
 * ANV-0033 — Unit tests for capability/model-provenance doctor row.
 */

import { writeFileSync } from 'node:fs'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushModelProvenanceCheck } from '../../../../../src/commands/cli/doctor-checks/capability.js'
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
    models: [
      { id: 'balanced', provider: 'anthropic' },
      { id: 'cheap', provider: 'anthropic' },
    ],
  })
}

describe('capability/model-provenance', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = createTestTmpDir('anv-0033-test')
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
    pushModelProvenanceCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(0)
  })

  it('emits pass when all configured IDs are in snapshot or heuristics', () => {
    // Write a minimal models.json with known IDs
    const modelsJson = JSON.stringify({
      version: '1.0',
      defaults: {
        model: 'balanced',
        effort: 'medium',
        fallback_chain: ['cheap'],
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
        fast: 'cheap',
        balanced: 'balanced',
        powerful: 'best',
        default: 'balanced',
      },
    })
    writeFileSync(join(tmpDir, 'models.json'), modelsJson)
    const rows: DoctorCheckRow[] = []
    pushModelProvenanceCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
  })

  it('emits warn when a configured ID is unknown', () => {
    const modelsJson = JSON.stringify({
      version: '1.0',
      defaults: {
        model: 'claude-zeta-9-9',
        effort: 'medium',
        fallback_chain: [],
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
        fast: 'cheap',
        balanced: 'balanced',
        powerful: 'best',
        default: 'balanced',
      },
    })
    writeFileSync(join(tmpDir, 'models.json'), modelsJson)
    const rows: DoctorCheckRow[] = []
    pushModelProvenanceCheck(makeCtx(tmpDir), rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toMatch(/claude-zeta-9-9/)
  })
})
