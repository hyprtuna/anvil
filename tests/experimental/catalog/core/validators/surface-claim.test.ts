/**
 * ANV-0028 (P3) — Tests for surface-claim validator
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { quarantineDir } from '../../../../../src/experimental/catalog/core/quarantine.js'
import { validateSurfaceClaim } from '../../../../../src/experimental/catalog/core/validators/surface-claim.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateSurfaceClaim', () => {
  it('passes when manifest claims no hooks', async () => {
    const record = makeFixtureRecord()
    // Default fixture has no hook provides
    const ctx = makeCtx(anvilHome)
    const outcome = await validateSurfaceClaim(record, ctx)
    expect(outcome.id).toBe('surface-claim')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('block')
  })

  it('blocks when manifest claims hook but content/hooks/ does not exist', async () => {
    const record = makeFixtureRecord()
    const withHook = {
      ...record,
      manifest: {
        ...record.manifest,
        provides: { ...record.manifest.provides, hook: ['my-hook'] },
      },
    }
    // Create content dir but not hooks subdir
    const qDir = quarantineDir(
      anvilHome,
      record.source.id,
      record.manifest.name,
    )
    await mkdir(join(qDir, 'content'), { recursive: true })

    const ctx = makeCtx(anvilHome)
    const outcome = await validateSurfaceClaim(withHook, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('hooks/')
  })

  it('blocks when content/hooks/ exists but has no hooks.json', async () => {
    const record = makeFixtureRecord()
    const withHook = {
      ...record,
      manifest: {
        ...record.manifest,
        provides: { ...record.manifest.provides, hook: ['my-hook'] },
      },
    }
    const qDir = quarantineDir(
      anvilHome,
      record.source.id,
      record.manifest.name,
    )
    await mkdir(join(qDir, 'content', 'hooks'), { recursive: true })
    await writeFile(
      join(qDir, 'content', 'hooks', 'other.txt'),
      'not a hooks.json',
    )

    const ctx = makeCtx(anvilHome)
    const outcome = await validateSurfaceClaim(withHook, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
  })

  it('passes when manifest claims hook and content/hooks/hooks.json exists', async () => {
    const record = makeFixtureRecord()
    const withHook = {
      ...record,
      manifest: {
        ...record.manifest,
        provides: { ...record.manifest.provides, hook: ['my-hook'] },
      },
    }
    const qDir = quarantineDir(
      anvilHome,
      record.source.id,
      record.manifest.name,
    )
    await mkdir(join(qDir, 'content', 'hooks'), { recursive: true })
    await writeFile(
      join(qDir, 'content', 'hooks', 'hooks.json'),
      JSON.stringify({ hooks: [] }),
    )

    const ctx = makeCtx(anvilHome)
    const outcome = await validateSurfaceClaim(withHook, ctx)
    expect(outcome.status).toBe('pass')
  })
})
