/**
 * ANV-0028 (P3) — Tests for license-walk validator
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { quarantineDir } from '../../../../../src/experimental/catalog/core/quarantine.js'
import { validateLicense } from '../../../../../src/experimental/catalog/core/validators/license.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

async function mkContentDir(
  anvilHome: string,
  record: ReturnType<typeof makeFixtureRecord>,
): Promise<string> {
  const qDir = quarantineDir(anvilHome, record.source.id, record.manifest.name)
  const contentDir = join(qDir, 'content')
  await mkdir(contentDir, { recursive: true })
  return contentDir
}

describe('validateLicense', () => {
  it('passes when upstream_license is set to a valid SPDX value', async () => {
    const record = makeFixtureRecord() // has 'MIT' as upstream_license
    await mkContentDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)
    const outcome = await validateLicense(record, ctx)
    expect(outcome.id).toBe('license-walk')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('warn')
  })

  it('blocks when upstream_license is empty AND no LICENSE file', async () => {
    const record = makeFixtureRecord()
    const withEmpty = {
      ...record,
      provenance: { ...record.provenance, upstream_license: '' },
    }
    await mkContentDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)
    const outcome = await validateLicense(
      withEmpty as Parameters<typeof validateLicense>[0],
      ctx,
    )
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
  })

  it('blocks when upstream_license is UNKNOWN AND no LICENSE file', async () => {
    const record = makeFixtureRecord()
    const withUnknown = {
      ...record,
      provenance: { ...record.provenance, upstream_license: 'UNKNOWN' },
    }
    await mkContentDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)
    const outcome = await validateLicense(withUnknown, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
  })

  it('warns when upstream_license is UNKNOWN but LICENSE file exists', async () => {
    const record = makeFixtureRecord()
    const withUnknown = {
      ...record,
      provenance: { ...record.provenance, upstream_license: 'UNKNOWN' },
    }
    const contentDir = await mkContentDir(anvilHome, record)
    await writeFile(join(contentDir, 'LICENSE'), 'MIT License\nCopyright...')

    const ctx = makeCtx(anvilHome)
    const outcome = await validateLicense(withUnknown, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('warn')
    expect(outcome.message).toContain('UNKNOWN')
  })

  it('passes when LICENSE file contains expected MIT markers', async () => {
    const record = makeFixtureRecord() // MIT license
    const contentDir = await mkContentDir(anvilHome, record)
    await writeFile(join(contentDir, 'LICENSE'), 'MIT License\nCopyright 2026')

    const ctx = makeCtx(anvilHome)
    const outcome = await validateLicense(record, ctx)
    expect(outcome.status).toBe('pass')
  })
})
