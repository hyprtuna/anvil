/**
 * Tests for `anvil catalog show`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { showCommand } from '../../../../src/experimental/catalog/cli/show.js'
import { writeIndexAtomic } from '../../../../src/experimental/catalog/core/cache.js'
import type { CatalogIndex } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let stderrCapture: string[]
let origStdout: typeof process.stdout.write
let origStderr: typeof process.stderr.write

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-show-test')
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
      description: 'Reviews code with security focus',
      upstream_repo: 'wshobson/agents',
      upstream_path: 'code-reviewer',
      upstream_ref: 'abc1234',
      fetch_url: 'https://example.com/code-reviewer.tar.gz',
      fetch_kind: 'tarball',
      declared_license: 'MIT',
    },
  ],
}

describe('showCommand', () => {
  it('exits 1 for invalid format (no colon)', async () => {
    const code = await showCommand('badformat', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('<source>:<slug> format')
  })

  it('exits 1 for unknown source', async () => {
    const code = await showCommand('unknown:slug', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('unknown source')
  })

  it('exits 0 with not-found message when entry missing from index', async () => {
    const code = await showCommand('wshobson:nonexistent', {}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('No catalog entry')
  })

  it('shows entry details when found', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await showCommand('wshobson:code-reviewer', {}, home())
    expect(code).toBe(0)
    const out = stdoutCapture.join('')
    expect(out).toContain('Code Reviewer')
    expect(out).toContain('MIT')
  })

  it('json output includes entry and quarantine info', async () => {
    await writeIndexAtomic(home(), 'wshobson', FIXTURE_INDEX)
    const code = await showCommand(
      'wshobson:code-reviewer',
      { json: true },
      home(),
    )
    expect(code).toBe(0)
    const parsed = JSON.parse(stdoutCapture.join('')) as {
      source_id: string
      slug: string
      entry: { slug: string }
      quarantined: boolean
    }
    expect(parsed.source_id).toBe('wshobson')
    expect(parsed.slug).toBe('code-reviewer')
    expect(parsed.entry.slug).toBe('code-reviewer')
    expect(parsed.quarantined).toBe(false)
  })
})
