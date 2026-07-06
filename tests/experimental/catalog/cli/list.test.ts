/**
 * Tests for `anvil catalog list`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listCatalogCommand } from '../../../../src/experimental/catalog/cli/list.js'
import { writeIndexAtomic } from '../../../../src/experimental/catalog/core/cache.js'
import type { CatalogIndex } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let stderrCapture: string[]
let origStdout: typeof process.stdout.write
let origStderr: typeof process.stderr.write

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-list-test')
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
  fetched_at: '2026-01-01T00:00:00.000Z',
  entries: [
    {
      slug: 'code-reviewer',
      display_name: 'Code Reviewer',
      description: 'Reviews code',
      upstream_repo: 'wshobson/agents',
      upstream_path: 'code-reviewer',
      upstream_ref: 'abc1234',
      fetch_url: 'https://example.com/code-reviewer.tar.gz',
      fetch_kind: 'tarball',
    },
  ],
}

describe('listCatalogCommand', () => {
  it('exits 0 with empty cache', async () => {
    const code = await listCatalogCommand({}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('no cached index')
  })

  it('shows entries when index exists', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await listCatalogCommand({}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('code-reviewer')
  })

  it('json output includes source_id and entries', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await listCatalogCommand({ json: true }, home())
    expect(code).toBe(0)
    const result = JSON.parse(stdoutCapture.join('')) as Array<{
      source_id: string
      entry_count: number
    }>
    expect(result).toHaveLength(1)
    expect(result[0].source_id).toBe('wshobson')
    expect(result[0].entry_count).toBe(1)
  })

  it('exits 1 for unknown source', async () => {
    const code = await listCatalogCommand({ source: 'unknown-src' }, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('unknown source')
  })
})
