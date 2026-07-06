/**
 * ANV-0028 (P3) — Tests for description-shape validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateDescriptionShape } from '../../../../../src/experimental/catalog/core/validators/description-shape.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateDescriptionShape', () => {
  it('passes for description starting with "Use when"', async () => {
    const record = makeFixtureRecord()
    // Fixture has 'Use when you need...' which starts with 'Use when'
    const ctx = makeCtx(anvilHome)
    const outcome = await validateDescriptionShape(record, ctx)
    expect(outcome.id).toBe('description-shape')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('warn')
  })

  it('passes for description with "PROACTIVELY"', async () => {
    const record = makeFixtureRecord()
    const modified = {
      ...record,
      manifest: {
        ...record.manifest,
        description:
          'PROACTIVELY run this extension when code quality degrades.',
      },
    }
    const ctx = makeCtx(anvilHome)
    const outcome = await validateDescriptionShape(modified, ctx)
    expect(outcome.status).toBe('pass')
  })

  it('warns for description not starting with CSO prefix', async () => {
    const record = makeFixtureRecord()
    const modified = {
      ...record,
      manifest: {
        ...record.manifest,
        description: 'This extension does amazing things for code review.',
      },
    }
    const ctx = makeCtx(anvilHome)
    const outcome = await validateDescriptionShape(modified, ctx)
    expect(outcome.id).toBe('description-shape')
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('warn')
  })

  it('passes for "Run when" prefix', async () => {
    const record = makeFixtureRecord()
    const modified = {
      ...record,
      manifest: {
        ...record.manifest,
        description:
          'Run when the test suite reports failures and you need root cause analysis.',
      },
    }
    const ctx = makeCtx(anvilHome)
    const outcome = await validateDescriptionShape(modified, ctx)
    expect(outcome.status).toBe('pass')
  })
})
