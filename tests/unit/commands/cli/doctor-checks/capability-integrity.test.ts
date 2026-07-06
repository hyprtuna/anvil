/**
 * ANV-0033 — Unit tests for capability/snapshot-integrity doctor row.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { pushSnapshotIntegrityCheck } from '../../../../../src/commands/cli/doctor-checks/capability.js'
import type {
  DoctorCheckContext,
  DoctorCheckRow,
} from '../../../../../src/commands/cli/doctor-registry.js'
import * as capabilitySnapshot from '../../../../../src/core/models/capability-snapshot.js'

const CTX: DoctorCheckContext = {
  cwd: '/tmp/test',
  home: '/tmp/home',
  anvilHome: '/tmp/.anvil',
  inProject: false,
  skipDetail: 'not in project',
  installScope: 'unknown',
}

describe('capability/snapshot-integrity', () => {
  afterEach(() => {
    capabilitySnapshot._resetSnapshotCache()
    vi.restoreAllMocks()
  })

  it('emits pass when bundled snapshot parses successfully', () => {
    const rows: DoctorCheckRow[] = []
    pushSnapshotIntegrityCheck(CTX, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pass')
    expect(rows[0]?.name).toBe('Capability snapshot integrity')
  })

  it('emits fail when loadBundledSnapshot throws', () => {
    vi.spyOn(capabilitySnapshot, 'loadBundledSnapshot').mockImplementation(
      () => {
        throw new Error('file not found: /nonexistent/path')
      },
    )
    const rows: DoctorCheckRow[] = []
    pushSnapshotIntegrityCheck(CTX, rows)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('fail')
    expect(rows[0]?.detail).toMatch(/bundled snapshot invalid/)
  })
})
