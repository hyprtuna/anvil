/**
 * ANV-0033 — Unit tests for capability/snapshot-freshness doctor row.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushSnapshotFreshnessCheck } from '../../../../../src/commands/cli/doctor-checks/capability.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'
import * as capabilitySnapshot from '../../../../../src/core/models/capability-snapshot.js'
import { ModelCapabilitySnapshot } from '../../../../../src/core/types.js'

const CTX: DoctorCheckContext = {
  cwd: '/tmp/test',
  home: '/tmp/home',
  anvilHome: '/tmp/.anvil',
  inProject: false,
  skipDetail: 'not in project',
  installScope: 'unknown',
}

function makeSnapshot(generatedAt: string) {
  return ModelCapabilitySnapshot.parse({
    schema_version: 1,
    generated_at: generatedAt,
    source: 'test',
    models: [],
  })
}

describe('capability/snapshot-freshness', () => {
  afterEach(() => {
    capabilitySnapshot._resetSnapshotCache()
    vi.restoreAllMocks()
  })

  it('emits pass when snapshot is fresh (today)', () => {
    vi.spyOn(capabilitySnapshot, 'loadBundledSnapshot').mockReturnValue(
      makeSnapshot('2026-05-14T00:00:00.000Z'),
    )
    vi.spyOn(capabilitySnapshot, 'snapshotAgeDays').mockReturnValue(0)

    const rows: DoctorCheckRow[] = []
    pushSnapshotFreshnessCheck(CTX, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.detail).toMatch(/days old/)
  })

  it('emits warn when snapshot is stale (>90 days)', () => {
    vi.spyOn(capabilitySnapshot, 'loadBundledSnapshot').mockReturnValue(
      makeSnapshot('2025-01-01T00:00:00.000Z'),
    )
    vi.spyOn(capabilitySnapshot, 'snapshotAgeDays').mockReturnValue(120)

    const rows: DoctorCheckRow[] = []
    pushSnapshotFreshnessCheck(CTX, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('warn')
    expect(rows[0]?.detail).toMatch(/120 days old/)
  })

  it('emits nothing when loadBundledSnapshot throws (integrity check covers it)', () => {
    vi.spyOn(capabilitySnapshot, 'loadBundledSnapshot').mockImplementation(
      () => {
        throw new Error('file not found')
      },
    )
    const rows: DoctorCheckRow[] = []
    pushSnapshotFreshnessCheck(CTX, rows)
    expect(rows).toHaveLength(0)
  })
})
