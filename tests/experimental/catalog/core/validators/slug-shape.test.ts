/**
 * ANV-0028 (P3) — Tests for slug-shape validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateSlugShape } from '../../../../../src/experimental/catalog/core/validators/slug-shape.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateSlugShape', () => {
  it('passes for valid slug', async () => {
    const record = makeFixtureRecord()
    const outcome = await validateSlugShape(record, makeCtx(anvilHome))
    expect(outcome.id).toBe('slug-shape')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('block')
  })

  it('fails for slug starting with underscore', async () => {
    const record = makeFixtureRecord()
    // Manually set manifest.name to an underscore slug
    const corrupted = {
      ...record,
      manifest: { ...record.manifest, name: '_reserved' as never },
    }
    const outcome = await validateSlugShape(corrupted, makeCtx(anvilHome))
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('reserved')
  })

  it('fails for _quarantine reserved name', async () => {
    const record = makeFixtureRecord()
    const corrupted = {
      ...record,
      manifest: { ...record.manifest, name: '_quarantine' as never },
    }
    const outcome = await validateSlugShape(corrupted, makeCtx(anvilHome))
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
  })

  it('fails for _cache reserved name', async () => {
    const record = makeFixtureRecord()
    const corrupted = {
      ...record,
      manifest: { ...record.manifest, name: '_cache' as never },
    }
    const outcome = await validateSlugShape(corrupted, makeCtx(anvilHome))
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
  })

  it('passes for normal slug with dashes', async () => {
    const record = makeFixtureRecord()
    const modified = {
      ...record,
      manifest: { ...record.manifest, name: 'my-cool-extension' as never },
    }
    const outcome = await validateSlugShape(modified, makeCtx(anvilHome))
    expect(outcome.status).toBe('pass')
  })
})
