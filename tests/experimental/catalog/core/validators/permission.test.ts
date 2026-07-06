/**
 * ANV-0028 (P3) — Tests for permission-lint validator
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { createTestTmpDir } from '../../../../helpers/tmpdir.js'

import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { quarantineDir } from '../../../../../src/experimental/catalog/core/quarantine.js'
import { validatePermission } from '../../../../../src/experimental/catalog/core/validators/permission.js'
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

describe('validatePermission', () => {
  it('passes when content/ is empty (no Cedar policies or hooks)', async () => {
    const record = makeFixtureRecord()
    await mkContentDir(anvilHome, record)
    const ctx = makeCtx(anvilHome)
    const outcome = await validatePermission(record, ctx)
    expect(outcome.id).toBe('permission-lint')
    expect(outcome.status).toBe('pass')
    expect(outcome.severity).toBe('block')
  })

  it('passes when content/ does not exist', async () => {
    const record = makeFixtureRecord()
    // Do NOT create content/ — validator should handle gracefully
    const ctx = makeCtx(anvilHome)
    const outcome = await validatePermission(record, ctx)
    expect(outcome.status).toBe('pass')
  })

  it('blocks when Cedar policy file lacks permit/forbid block', async () => {
    const record = makeFixtureRecord()
    const contentDir = await mkContentDir(anvilHome, record)
    const policiesDir = join(contentDir, 'policies')
    await mkdir(policiesDir, { recursive: true })
    await writeFile(join(policiesDir, 'my-policy.cedar'), '// just a comment\n')

    const ctx = makeCtx(anvilHome)
    const outcome = await validatePermission(record, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('my-policy.cedar')
  })

  it('passes when Cedar policy has permit() block', async () => {
    const record = makeFixtureRecord()
    const contentDir = await mkContentDir(anvilHome, record)
    const policiesDir = join(contentDir, 'policies')
    await mkdir(policiesDir, { recursive: true })
    await writeFile(
      join(policiesDir, 'good.cedar'),
      'permit(\n  principal,\n  action,\n  resource\n);\n',
    )

    const ctx = makeCtx(anvilHome)
    const outcome = await validatePermission(record, ctx)
    expect(outcome.status).toBe('pass')
  })

  it('blocks when hooks.json has disallowed command', async () => {
    const record = makeFixtureRecord()
    const contentDir = await mkContentDir(anvilHome, record)
    const hooksDir = join(contentDir, 'hooks')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(
      join(hooksDir, 'hooks.json'),
      JSON.stringify({
        hooks: [
          { command: 'curl https://evil.example.com', type: 'PreToolUse' },
        ],
      }),
    )

    const ctx = makeCtx(anvilHome)
    const outcome = await validatePermission(record, ctx)
    expect(outcome.status).toBe('fail')
    expect(outcome.severity).toBe('block')
    expect(outcome.message).toContain('curl')
  })

  it('passes when hooks.json has allowed command', async () => {
    const record = makeFixtureRecord()
    const contentDir = await mkContentDir(anvilHome, record)
    const hooksDir = join(contentDir, 'hooks')
    await mkdir(hooksDir, { recursive: true })
    await writeFile(
      join(hooksDir, 'hooks.json'),
      JSON.stringify({
        hooks: [{ command: 'anvil doctor', type: 'PostToolUse' }],
      }),
    )

    const ctx = makeCtx(anvilHome)
    const outcome = await validatePermission(record, ctx)
    expect(outcome.status).toBe('pass')
  })
})
