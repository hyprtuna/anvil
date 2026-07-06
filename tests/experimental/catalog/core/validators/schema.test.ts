/**
 * ANV-0028 (P3) — Tests for schema validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ValidatorContext } from '../../../../../src/experimental/catalog/core/validators/index.js'
import { validateSchema } from '../../../../../src/experimental/catalog/core/validators/schema.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateSchema', () => {
  it('passes when manifest is valid', async () => {
    const record = makeFixtureRecord()
    const ctx: ValidatorContext = makeCtx(anvilHome)
    const outcome = await validateSchema(record, ctx)
    expect(outcome.id).toBe('schema')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('block')
  })

  it('fails with block severity when manifest has invalid fields', async () => {
    const record = makeFixtureRecord()
    // Corrupt the manifest
    const corrupted = {
      ...record,
      manifest: {
        ...record.manifest,
        schema_version: 'not-a-semver', // invalid
      },
    }
    const ctx: ValidatorContext = makeCtx(anvilHome)
    // We need to test via raw object since TypeScript won't allow invalid types
    const outcome = await validateSchema(
      corrupted as Parameters<typeof validateSchema>[0],
      ctx,
    )
    expect(outcome.id).toBe('schema')
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('schema')
  })

  it('fails when manifest is missing required fields', async () => {
    const record = makeFixtureRecord()
    const corrupted = {
      ...record,
      manifest: {
        name: 'my-extension',
        // missing schema_version, version, description, kind, compatibility
      },
    }
    const ctx: ValidatorContext = makeCtx(anvilHome)
    const outcome = await validateSchema(
      corrupted as Parameters<typeof validateSchema>[0],
      ctx,
    )
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
  })
})
