/**
 * Tests for `anvil catalog search`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { searchCommand } from '../../../../src/experimental/catalog/cli/search.js'
import { writeIndexAtomic } from '../../../../src/experimental/catalog/core/cache.js'
import type { CatalogIndex } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let stderrCapture: string[]
let origStdout: typeof process.stdout.write
let origStderr: typeof process.stderr.write

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-search-test')
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
})

afterEach(async () => {
  process.stdout.write = origStdout
  process.stderr.write = origStderr
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
      description: 'Reviews pull requests with security focus',
      upstream_repo: 'wshobson/agents',
      upstream_path: 'code-reviewer',
      upstream_ref: 'abc1234',
      fetch_url: 'https://example.com/code-reviewer.tar.gz',
      fetch_kind: 'tarball',
      declared_kind: 'extension',
    },
    {
      slug: 'debugger',
      display_name: 'Debugger Agent',
      description: 'Debug failing tests automatically',
      upstream_repo: 'wshobson/agents',
      upstream_path: 'debugger',
      upstream_ref: 'def5678',
      fetch_url: 'https://example.com/debugger.tar.gz',
      fetch_kind: 'tarball',
      declared_kind: 'extension',
    },
  ],
}

describe('searchCommand', () => {
  it('exits 1 on empty query', async () => {
    const code = await searchCommand('', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('must not be empty')
  })

  it('returns no results when cache is empty', async () => {
    const code = await searchCommand('code', {}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('No results')
  })

  it('finds matches by slug', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await searchCommand('code-reviewer', {}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('code-reviewer')
  })

  it('finds matches by display_name', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await searchCommand('Debugger', {}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('debugger')
  })

  it('json output is an array of matching entries with source_id', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await searchCommand('code', { json: true }, home())
    expect(code).toBe(0)
    const out = JSON.parse(stdoutCapture.join('')) as Array<{
      slug: string
      source_id: string
    }>
    expect(out.length).toBeGreaterThan(0)
    expect(out[0].source_id).toBe('wshobson')
  })

  it('exits 1 on unknown source', async () => {
    const code = await searchCommand('foo', { source: 'unknown-src' }, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('unknown source')
  })

  it('applies --kind filter', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await searchCommand(
      'agent',
      { kind: 'preset', json: true },
      home(),
    )
    expect(code).toBe(0)
    // All entries have declared_kind: 'extension', none are 'preset'
    const hits = JSON.parse(stdoutCapture.join('')) as unknown[]
    expect(hits.length).toBe(0)
  })
})
