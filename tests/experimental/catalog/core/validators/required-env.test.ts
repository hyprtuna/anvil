/**
 * ANV-0028 (P3) — Tests for required-env validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateRequiredEnv } from '../../../../../src/experimental/catalog/core/validators/required-env.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateRequiredEnv', () => {
  it('passes when no required_env declared', async () => {
    const record = makeFixtureRecord()
    const ctx = makeCtx(anvilHome)
    const outcome = await validateRequiredEnv(record, ctx)
    expect(outcome.id).toBe('required-env')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('warn')
  })

  it('passes when required_env vars are all set', async () => {
    const record = makeFixtureRecord()
    const withEnv = {
      ...record,
      manifest: {
        ...record.manifest,
        required_env: ['PATH'], // PATH is always set
      },
    }
    const ctx = makeCtx(anvilHome)
    const outcome = await validateRequiredEnv(
      withEnv as Parameters<typeof validateRequiredEnv>[0],
      ctx,
    )
    expect(outcome.status).toBe('pass')
  })

  it('warns when required_env var is not set', async () => {
    const record = makeFixtureRecord()
    const missingVar = `ANVIL_TEST_MISSING_VAR_UNIQUE_${Date.now()}`
    const withEnv = {
      ...record,
      manifest: {
        ...record.manifest,
        required_env: [missingVar],
      },
    }
    const ctx = makeCtx(anvilHome)
    const outcome = await validateRequiredEnv(
      withEnv as Parameters<typeof validateRequiredEnv>[0],
      ctx,
    )
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('warn')
    expect(outcome.message).toContain(missingVar)
  })

  it('warns when some required_env vars are missing', async () => {
    const record = makeFixtureRecord()
    const missingVar = `ANVIL_DEFINITELY_MISSING_${Date.now()}`
    const withEnv = {
      ...record,
      manifest: {
        ...record.manifest,
        required_env: ['PATH', missingVar],
      },
    }
    const ctx = makeCtx(anvilHome)
    const outcome = await validateRequiredEnv(
      withEnv as Parameters<typeof validateRequiredEnv>[0],
      ctx,
    )
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('warn')
    expect(outcome.message).toContain('1 required env var')
  })
})
