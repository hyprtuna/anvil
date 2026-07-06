/**
 * ANV-0245 — Doctor row "Experimental features" — unit tests.
 *
 * Tests the pure builder `buildExperimentalDoctorRows`.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { buildExperimentalDoctorRows } from '../../../../../src/commands/cli/doctor-checks/experimental.js'
import {
  __resetForTests,
  registerExperimentalFeature,
} from '../../../../../src/core/experimental-registry.js'

describe('buildExperimentalDoctorRows()', () => {
  afterEach(() => {
    __resetForTests()
  })

  it('returns one row per registered feature (3 by default)', () => {
    const rows = buildExperimentalDoctorRows()
    expect(rows).toHaveLength(3)
  })

  it('each row has name, status, and detail', () => {
    for (const row of buildExperimentalDoctorRows()) {
      expect(typeof row.name).toBe('string')
      expect(['pass', 'warn', 'fail', 'skip']).toContain(row.status)
      expect(typeof row.detail).toBe('string')
    }
  })

  it('row name includes the feature id', () => {
    const rows = buildExperimentalDoctorRows()
    const ids = ['catalog', 'notepads', 'extensions']
    for (const id of ids) {
      const row = rows.find((r) => r.name.includes(id))
      expect(row, `row for "${id}" should exist`).toBeDefined()
    }
  })

  it('detail includes progress percentage', () => {
    const rows = buildExperimentalDoctorRows()
    for (const row of rows) {
      expect(row.detail).toMatch(/75%/)
    }
  })

  it('detail includes status', () => {
    const rows = buildExperimentalDoctorRows()
    for (const row of rows) {
      expect(row.detail).toMatch(/inflight/)
    }
  })

  it('detail includes owner ticket', () => {
    const rows = buildExperimentalDoctorRows()
    // ANV-0246: ownerTicket is ANV-0028 (the original catalog development ticket,
    // not the move ticket). The move ticket ANV-0246 is not the ownerTicket.
    const catalogRow = rows.find((r) => r.name.includes('catalog'))
    expect(catalogRow?.detail).toMatch(/ANV-0028/)
  })

  it('reflects a newly registered feature', () => {
    registerExperimentalFeature({
      id: 'my-test-feature',
      title: 'My Test Feature',
      status: 'paused',
      progress: 30,
      ownerTicket: 'ANV-9999',
    })
    const rows = buildExperimentalDoctorRows()
    expect(rows).toHaveLength(4)
    const row = rows.find((r) => r.name.includes('my-test-feature'))
    expect(row).toBeDefined()
    expect(row?.detail).toMatch(/30%/)
    expect(row?.detail).toMatch(/paused/)
  })

  it('graduating features are visible in the list', () => {
    registerExperimentalFeature({
      id: 'almost-done',
      title: 'Almost Done',
      status: 'graduating',
      progress: 95,
      ownerTicket: 'ANV-9999',
      graduationTarget: 'v1.0.0',
    })
    const rows = buildExperimentalDoctorRows()
    const row = rows.find((r) => r.name.includes('almost-done'))
    expect(row).toBeDefined()
    expect(row?.detail).toMatch(/graduating/)
    expect(row?.detail).toMatch(/v1.0.0/)
  })

  it('extensions row includes follow-up items in detail', () => {
    const rows = buildExperimentalDoctorRows()
    const row = rows.find((r) => r.name.includes('extensions'))
    expect(row).toBeDefined()
    expect(row?.detail).toMatch(/follow-ups:/)
    expect(row?.detail).toContain('manifest schema: tools[]')
    expect(row?.detail).toContain('manifest schema: required_env')
  })

  it('feature with followups renders them joined by ", "', () => {
    registerExperimentalFeature({
      id: 'test-followups',
      title: 'Test Follow-ups',
      status: 'inflight',
      progress: 50,
      ownerTicket: 'ANV-9999',
      followups: ['item-a', 'item-b'],
    })
    const rows = buildExperimentalDoctorRows()
    const row = rows.find((r) => r.name.includes('test-followups'))
    expect(row).toBeDefined()
    expect(row?.detail).toMatch(/follow-ups: item-a, item-b/)
  })

  it('feature without followups does not render follow-ups in detail', () => {
    registerExperimentalFeature({
      id: 'no-followups',
      title: 'No Follow-ups',
      status: 'inflight',
      progress: 50,
      ownerTicket: 'ANV-9999',
    })
    const rows = buildExperimentalDoctorRows()
    const row = rows.find((r) => r.name.includes('no-followups'))
    expect(row).toBeDefined()
    expect(row?.detail).not.toMatch(/follow-ups:/)
  })
})
