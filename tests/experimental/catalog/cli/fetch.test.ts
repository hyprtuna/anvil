/**
 * Tests for `anvil catalog fetch`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fetchCommand } from '../../../../src/experimental/catalog/cli/fetch.js'
import { writeIndexAtomic } from '../../../../src/experimental/catalog/core/cache.js'
import { listQuarantineRecords } from '../../../../src/experimental/catalog/core/quarantine.js'
import type { CatalogIndex } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let stderrCapture: string[]
let origStdout: typeof process.stdout.write
let origStderr: typeof process.stderr.write
let origOffline: string | undefined

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-fetch-test')
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

const FIXTURE_INDEX: CatalogIndex = {
  source_id: 'wshobson',
  schema_version: '1.0.0',
  fetched_at: new Date().toISOString(),
  entries: [
    {
      slug: 'code-reviewer',
      display_name: 'Code Reviewer',
      description: 'Reviews code security focus',
      upstream_repo: 'wshobson/agents',
      upstream_path: 'code-reviewer',
      upstream_ref: 'abc1234',
      fetch_url: 'https://example.com/code-reviewer.tar.gz',
      fetch_kind: 'tarball',
    },
  ],
}

describe('fetchCommand — offline mode', () => {
  it('exits 4 when ANVIL_OFFLINE=1', async () => {
    const code = await fetchCommand('wshobson:code-reviewer', {}, home())
    expect(code).toBe(4)
  })

  it('json output indicates offline', async () => {
    const code = await fetchCommand(
      'wshobson:code-reviewer',
      { json: true },
      home(),
    )
    expect(code).toBe(4)
    const parsed = JSON.parse(stdoutCapture.join('')) as { status: string }
    expect(parsed.status).toBe('offline')
  })
})

describe('fetchCommand — input validation', () => {
  beforeEach(() => {
    process.env.ANVIL_OFFLINE = undefined
  })

  it('exits 1 for invalid format', async () => {
    const code = await fetchCommand('badformat', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('<source>:<slug> format')
  })

  it('exits 1 for unknown source', async () => {
    const code = await fetchCommand('unknown:slug', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('unknown source')
  })

  it('exits 1 when no cached index exists', async () => {
    const code = await fetchCommand('wshobson:code-reviewer', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('no cached index')
  })

  it('exits 1 when slug not found in index', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await fetchCommand('wshobson:nonexistent', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('not found')
  })
})

describe('fetchCommand — with mock fetch (network success)', () => {
  beforeEach(() => {
    process.env.ANVIL_OFFLINE = undefined
  })

  it('writes quarantine record when fetch succeeds', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)

    // Mock globalThis.fetch to return a fake blob
    const fakeBytes = Buffer.from('fake-tarball-content')
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => {
      return new Response(fakeBytes, {
        status: 200,
        headers: { 'content-type': 'application/gzip' },
      })
    }

    const code = await fetchCommand('wshobson:code-reviewer', {}, home())

    globalThis.fetch = origFetch

    expect(code).toBe(0)

    // Verify quarantine record exists
    const records = await listQuarantineRecords(home())
    expect(records.length).toBe(1)
    expect(records[0].source.id).toBe('wshobson')
    expect(records[0].manifest.name).toBe('code-reviewer')
  })

  it('json output includes quarantine_id', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)

    const fakeBytes = Buffer.from('fake-content-json')
    const origFetch = globalThis.fetch
    globalThis.fetch = async () => {
      return new Response(fakeBytes, { status: 200 })
    }

    const code = await fetchCommand(
      'wshobson:code-reviewer',
      { json: true },
      home(),
    )

    globalThis.fetch = origFetch

    expect(code).toBe(0)
    const parsed = JSON.parse(stdoutCapture.join('')) as {
      quarantine_id: string
    }
    expect(parsed.quarantine_id).toContain('wshobson-code-reviewer-')
  })
})
