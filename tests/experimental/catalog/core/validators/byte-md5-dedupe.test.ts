/**
 * ANV-0028 (P3) — Tests for byte-md5-dedupe validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateByteMd5Dedupe } from '../../../../../src/experimental/catalog/core/validators/byte-md5-dedupe.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateByteMd5Dedupe', () => {
  it('passes when no inventory md5 conflicts exist', async () => {
    const record = makeFixtureRecord()
    const ctx = makeCtx(anvilHome, {
      promotedInventoryMd5: new Set(['deadbeef00112233445566778899aabb']), // different md5
    })
    const outcome = await validateByteMd5Dedupe(record, ctx)
    expect(outcome.id).toBe('byte-md5-dedupe')
    expect(outcome.status).toBe('pass')
  })

  it('warns when md5 conflict detected', async () => {
    const record = makeFixtureRecord()
    const conflictingMd5 = record.inventory[0]!.md5
    const ctx = makeCtx(anvilHome, {
      promotedInventoryMd5: new Set([conflictingMd5]),
    })
    const outcome = await validateByteMd5Dedupe(record, ctx)
    expect(outcome.id).toBe('byte-md5-dedupe')
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('warn')
    expect(outcome.message).toContain('1 inventory item')
  })

  it('passes when inventory is empty', async () => {
    const record = makeFixtureRecord({ inventory: [] })
    const ctx = makeCtx(anvilHome)
    const outcome = await validateByteMd5Dedupe(record, ctx)
    expect(outcome.status).toBe('pass')
  })

  it('reports multiple conflicts', async () => {
    const record = makeFixtureRecord({
      inventory: [
        {
          relpath: 'skills/a.md',
          bytes: 100,
          md5: 'aaaa',
          role: 'skill',
          token_estimate: 30,
        },
        {
          relpath: 'skills/b.md',
          bytes: 100,
          md5: 'bbbb',
          role: 'skill',
          token_estimate: 30,
        },
        {
          relpath: 'agents/c.md',
          bytes: 100,
          md5: 'cccc',
          role: 'agent',
          token_estimate: 30,
        },
      ],
    })
    const ctx = makeCtx(anvilHome, {
      promotedInventoryMd5: new Set(['aaaa', 'bbbb']),
    })
    const outcome = await validateByteMd5Dedupe(record, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.message).toContain('2 inventory item')
  })
})
