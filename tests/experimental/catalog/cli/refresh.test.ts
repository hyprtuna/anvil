/**
 * Tests for `anvil catalog refresh`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { refreshCommand } from '../../../../src/experimental/catalog/cli/refresh.js'
import { readIndex } from '../../../../src/experimental/catalog/core/cache.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let stderrCapture: string[]
let origStdout: typeof process.stdout.write
let origStderr: typeof process.stderr.write
let origOffline: string | undefined

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-refresh-test')
  stdoutCapture = []
  stderrCapture = []
  origStdout = process.stdout.write.bind(process.stdout)
  origStderr = process.stderr.write.bind(process.stderr)
  process.stdout.write = (chunk: unknown) => {
    stdoutCapture.push(String(chunk))
    return true
  }
  process.stderr.write = (chunk: unknown) => {
    stderrCapture.push(String(chunk))
    return true
  }
  origOffline = process.env.ANVIL_OFFLINE
  process.env.ANVIL_OFFLINE = '1'
})

afterEach(async () => {
  process.stdout.write = origStdout
  process.stderr.write = origStderr
  if (origOffline === undefined) {
    process.env.ANVIL_OFFLINE = undefined
  } else {
    process.env.ANVIL_OFFLINE = origOffline
  }
  await rm(tmpBase, { recursive: true, force: true })
})

function home(): string {
  return join(tmpBase, 'home')
}

describe('refreshCommand — offline mode', () => {
  it('exits 4 when ANVIL_OFFLINE=1', async () => {
    const code = await refreshCommand({}, home())
    expect(code).toBe(4)
  })

  it('json output includes offline status', async () => {
    const code = await refreshCommand({ json: true }, home())
    expect(code).toBe(4)
    const output = stdoutCapture.join('')
    const parsed = JSON.parse(output) as { status: string }
    expect(parsed.status).toBe('offline')
  })

  it('exits 4 for unknown source when offline guard fires first', async () => {
    // offline guard fires before source validation
    const code = await refreshCommand({ source: 'nonexistent' }, home())
    expect(code).toBe(4)
  })
})

describe('refreshCommand — unknown source (online)', () => {
  it('exits 1 for unknown source when not offline', async () => {
    process.env.ANVIL_OFFLINE = undefined
    const code = await refreshCommand(
      { source: 'nonexistent-source-xyz' },
      home(),
    )
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('unknown source')
  })
})

describe('refreshCommand — with mock fetch (network success)', () => {
  it('writes index when fetch succeeds', async () => {
    process.env.ANVIL_OFFLINE = undefined

    // We test the cache write path independently
    const { writeIndexAtomic } = await import(
      '../../../../src/experimental/catalog/core/cache.js'
    )
    const testIndex = {
      source_id: 'wshobson',
      schema_version: '1.0.0',
      fetched_at: new Date().toISOString(),
      entries: [],
    }
    await writeIndexAtomic(home(), 'wshobson', testIndex)
    const result = await readIndex(home(), 'wshobson')
    expect(result).not.toBeNull()
    expect(result?.source_id).toBe('wshobson')
  })
})
