/**
 * ANV-0028 (P3) — Tests for runValidationPipeline orchestrator
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { quarantineDir } from '../../../../../src/experimental/catalog/core/quarantine.js'
import {
  buildValidatorContext,
  runValidationPipeline,
} from '../../../../../src/experimental/catalog/core/validators/index.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

async function ensureQuarantineDir(
  anvilHome: string,
  record: ReturnType<typeof makeFixtureRecord>,
): Promise<void> {
  const qDir = quarantineDir(anvilHome, record.source.id, record.manifest.name)
  await mkdir(join(qDir, 'content'), { recursive: true })
}

describe('runValidationPipeline', () => {
  it('returns decision=promoted when all validators pass', async () => {
    const record = makeFixtureRecord()
    await ensureQuarantineDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)

    const result = await runValidationPipeline(record, ctx)

    expect(result.quarantine_id).toBe(record.quarantine_id)
    expect(result.decision).toBe('promoted')
    expect(result.validations).toHaveLength(10)
    expect(result.validations.every((v) => v.status === 'pass')).toBe(true)
  })

  it('returns decision=blocked when a block-severity validator fails', async () => {
    const record = makeFixtureRecord()
    await ensureQuarantineDir(anvilHome, record)

    // Poison the bundled set so slug-collision (block) fires
    const ctx = makeCtx(anvilHome, {
      bundled: {
        skill: new Set(['my-skill']), // collides with record.manifest.provides.skill
        agent: new Set(),
        hook: new Set(),
        command: new Set(),
      },
    })

    const result = await runValidationPipeline(record, ctx)

    expect(result.decision).toBe('blocked')
    const collisionOutcome = result.validations.find(
      (v) => v.id === 'slug-collision',
    )
    expect(collisionOutcome?.status).toBe('fail')
    expect(collisionOutcome?.severity).toBe('block')
  })

  it('returns decision=warned-but-promoted when only warn validators fail', async () => {
    const record = makeFixtureRecord()
    await ensureQuarantineDir(anvilHome, record)

    // Make token budget tiny so token-budget (warn) fires
    const ctx = makeCtx(anvilHome, { tokenBudget: 1 })

    const result = await runValidationPipeline(record, ctx)

    expect(result.decision).toBe('warned-but-promoted')
    const tokenOutcome = result.validations.find((v) => v.id === 'token-budget')
    expect(tokenOutcome?.status).toBe('fail')
    expect(tokenOutcome?.severity).toBe('warn')
  })

  it('writes validation.json to the quarantine directory', async () => {
    const record = makeFixtureRecord()
    await ensureQuarantineDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)

    await runValidationPipeline(record, ctx)

    const qDir = quarantineDir(
      anvilHome,
      record.source.id,
      record.manifest.name,
    )
    const raw = await readFile(join(qDir, 'validation.json'), 'utf-8')
    const parsed = JSON.parse(raw) as unknown

    expect(parsed).toHaveProperty('results')
    expect(parsed).toHaveProperty('decision')
    expect((parsed as { results: unknown[] }).results).toHaveLength(10)
  })

  it('validation.json decision matches returned result', async () => {
    const record = makeFixtureRecord()
    await ensureQuarantineDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)

    const result = await runValidationPipeline(record, ctx)

    const qDir = quarantineDir(
      anvilHome,
      record.source.id,
      record.manifest.name,
    )
    const raw = await readFile(join(qDir, 'validation.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { decision: string }

    expect(parsed.decision).toBe(result.decision)
  })
})

describe('buildValidatorContext', () => {
  it('builds context with empty promotedInventoryMd5 when no extensions installed', async () => {
    const ctx = await buildValidatorContext(anvilHome)
    expect(ctx.anvilHome).toBe(anvilHome)
    expect(ctx.promotedInventoryMd5.size).toBe(0)
    expect(ctx.candidateBatch).toHaveLength(0)
    expect(ctx.tokenBudget).toBeGreaterThan(0)
  })

  it('uses ANVIL_TOKEN_BUDGET env var when set', async () => {
    const original = process.env.ANVIL_TOKEN_BUDGET
    process.env.ANVIL_TOKEN_BUDGET = '5000'
    try {
      const ctx = await buildValidatorContext(anvilHome)
      expect(ctx.tokenBudget).toBe(5000)
    } finally {
      if (original === undefined) {
        process.env.ANVIL_TOKEN_BUDGET = undefined
      } else {
        process.env.ANVIL_TOKEN_BUDGET = original
      }
    }
  })

  it('uses default budget when ANVIL_TOKEN_BUDGET is not set', async () => {
    const original = process.env.ANVIL_TOKEN_BUDGET
    process.env.ANVIL_TOKEN_BUDGET = undefined
    try {
      const ctx = await buildValidatorContext(anvilHome)
      expect(ctx.tokenBudget).toBe(20000)
    } finally {
      if (original !== undefined) {
        process.env.ANVIL_TOKEN_BUDGET = original
      }
    }
  })
})
