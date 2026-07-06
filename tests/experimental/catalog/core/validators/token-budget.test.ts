/**
 * ANV-0028 (P3) — Tests for token-budget validator
 */

import { rm } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { validateTokenBudget } from '../../../../../src/experimental/catalog/core/validators/token-budget.js'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'
import { makeCtx, makeFixtureRecord } from './helpers.js'

let anvilHome: string

beforeEach(async () => {
  anvilHome = createTestTmpDir('anvil-test')
})

afterEach(async () => {
  await rm(anvilHome, { recursive: true, force: true })
})

describe('validateTokenBudget', () => {
  it('passes when total token estimate is within budget', async () => {
    const record = makeFixtureRecord({
      inventory: [
        {
          relpath: 'skills/a.md',
          bytes: 100,
          md5: 'aaa',
          role: 'skill',
          token_estimate: 100,
        },
        {
          relpath: 'skills/b.md',
          bytes: 100,
          md5: 'bbb',
          role: 'skill',
          token_estimate: 200,
        },
      ],
    })
    const ctx = makeCtx(anvilHome, { tokenBudget: 1000 })
    const outcome = await validateTokenBudget(record, ctx)
    expect(outcome.id).toBe('token-budget')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('warn')
  })

  it('warns when total token estimate exceeds budget', async () => {
    const record = makeFixtureRecord({
      inventory: [
        {
          relpath: 'skills/a.md',
          bytes: 100,
          md5: 'aaa',
          role: 'skill',
          token_estimate: 15000,
        },
        {
          relpath: 'skills/b.md',
          bytes: 100,
          md5: 'bbb',
          role: 'skill',
          token_estimate: 8000,
        },
      ],
    })
    const ctx = makeCtx(anvilHome, { tokenBudget: 20000 })
    const outcome = await validateTokenBudget(record, ctx)
    expect(outcome.id).toBe('token-budget')
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('warn')
    expect(outcome.message).toContain('23,000')
    expect(outcome.message).toContain('20,000')
  })

  it('passes with empty inventory (zero tokens)', async () => {
    const record = makeFixtureRecord({ inventory: [] })
    const ctx = makeCtx(anvilHome, { tokenBudget: 1000 })
    const outcome = await validateTokenBudget(record, ctx)
    expect(outcome.status).toBe('pass')
  })

  it('passes when total exactly equals budget', async () => {
    const record = makeFixtureRecord({
      inventory: [
        {
          relpath: 'skills/a.md',
          bytes: 100,
          md5: 'aaa',
          role: 'skill',
          token_estimate: 1000,
        },
      ],
    })
    const ctx = makeCtx(anvilHome, { tokenBudget: 1000 })
    const outcome = await validateTokenBudget(record, ctx)
    expect(outcome.status).toBe('pass')
  })
})
