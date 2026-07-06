/**
 * Tests for `anvil catalog drop`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { dropCommand } from '../../../../src/experimental/catalog/cli/drop.js'
import {
  listQuarantineRecords,
  writeQuarantineRecord,
} from '../../../../src/experimental/catalog/core/quarantine.js'
import type { QuarantineRecord } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let stderrCapture: string[]
let origStdout: typeof process.stdout.write
let origStderr: typeof process.stderr.write

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-drop-test')
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

function makeRecord(slug: string): QuarantineRecord {
  return {
    quarantine_id: `wshobson-${slug}-abc12345`,
    schema_version: '1.0.0',
    created_at: '2026-01-01T00:00:00.000Z',
    source: {
      id: 'wshobson',
      display_name: 'wshobson/agents',
      index_url: 'https://example.com/INDEX.json',
      trust_tier: 'community',
    },
    index_entry: {
      slug,
      display_name: `${slug} agent`,
      description: 'A test agent for testing purposes here',
      upstream_repo: 'wshobson/agents',
      upstream_path: slug,
      upstream_ref: 'abc12345',
      fetch_url: `https://example.com/${slug}.tar.gz`,
      fetch_kind: 'tarball',
    },
    provenance: {
      source_id: 'wshobson',
      source_repo: 'wshobson/agents',
      source_path: slug,
      vendored_at: '2026-01-01T00:00:00.000Z',
      upstream_license: 'MIT',
      upstream_version_or_commit: 'abc12345',
      upstream_license_source: 'declared',
    },
    manifest: {
      schema_version: '1.0.0',
      name: slug,
      version: '1.0.0',
      description: 'A test agent',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: { min_anvil_version: '0.1.0' },
    },
    blob_sha256: 'a'.repeat(64),
    content_dir: 'content/',
    inventory: [],
  }
}

describe('dropCommand', () => {
  it('exits 1 on empty quarantine-id', async () => {
    const code = await dropCommand('', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('must not be empty')
  })

  it('exits 0 gracefully when record not found', async () => {
    const code = await dropCommand('nonexistent-id', {}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('nothing to drop')
  })

  it('drops an existing record', async () => {
    await writeQuarantineRecord(home(), makeRecord('drop-me'))
    const records = await listQuarantineRecords(home())
    expect(records).toHaveLength(1)

    const code = await dropCommand('wshobson-drop-me-abc12345', {}, home())
    expect(code).toBe(0)

    const remaining = await listQuarantineRecords(home())
    expect(remaining).toHaveLength(0)
  })

  it('json output reports dropped: true', async () => {
    await writeQuarantineRecord(home(), makeRecord('json-drop'))
    const code = await dropCommand(
      'wshobson-json-drop-abc12345',
      { json: true },
      home(),
    )
    expect(code).toBe(0)
    const out = JSON.parse(stdoutCapture.join('')) as {
      dropped: boolean
      quarantine_id: string
    }
    expect(out.dropped).toBe(true)
    expect(out.quarantine_id).toBe('wshobson-json-drop-abc12345')
  })

  it('json output reports dropped: false when not found', async () => {
    const code = await dropCommand('nonexistent-qid', { json: true }, home())
    expect(code).toBe(0)
    const out = JSON.parse(stdoutCapture.join('')) as { dropped: boolean }
    expect(out.dropped).toBe(false)
  })
})
