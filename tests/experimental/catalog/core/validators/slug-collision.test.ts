/**
 * ANV-0028 (P3) — Tests for slug-collision validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateSlugCollision } from '../../../../../src/experimental/catalog/core/validators/slug-collision.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateSlugCollision', () => {
  it('passes when no collisions detected', async () => {
    const record = makeFixtureRecord()
    const ctx = makeCtx(anvilHome)
    const outcome = await validateSlugCollision(record, ctx)
    expect(outcome.id).toBe('slug-collision')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('block')
  })

  it('fails when bundled slug is shadowed (tier 2)', async () => {
    const record = makeFixtureRecord()
    const ctx = makeCtx(anvilHome, {
      bundled: {
        skill: new Set(['my-skill']), // conflicts with record.manifest.provides.skill
        agent: new Set(),
        hook: new Set(),
        command: new Set(),
      },
    })
    const outcome = await validateSlugCollision(record, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('tier-2')
  })

  it('fails when candidate batch has collision (tier 1 — name collision)', async () => {
    const record = makeFixtureRecord()
    // A different record with same name but different quarantine_id
    // so it is not filtered out as "self"
    const otherRecord = makeFixtureRecord({
      quarantine_id: 'wshobson-my-extension-different-id',
    })
    // Same name 'my-extension' in batch = tier 1 collision
    const ctx = makeCtx(anvilHome, {
      candidateBatch: [otherRecord],
    })
    const outcome = await validateSlugCollision(record, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('tier-1')
  })

  it('passes when candidate batch only contains self', async () => {
    const record = makeFixtureRecord()
    const ctx = makeCtx(anvilHome, {
      candidateBatch: [record], // self is excluded
    })
    const outcome = await validateSlugCollision(record, ctx)
    expect(outcome.status).toBe('pass')
  })
})
