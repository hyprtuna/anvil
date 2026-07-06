/**
 * Tests for `anvil catalog status`.
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { statusCommand } from '../../../../src/experimental/catalog/cli/status.js'
import { writeQuarantineRecord } from '../../../../src/experimental/catalog/core/quarantine.js'
import type { QuarantineRecord } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

let tmpBase: string
let stdoutCapture: string[]
let origStdout: typeof process.stdout.write

beforeEach(() => {
  tmpBase = createTestTmpDir('anvil-catalog-status-test')
  stdoutCapture = []
  origStdout = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk: unknown) => {
    stdoutCapture.push(String(chunk))
    return true
  }
})

afterEach(async () => {
  process.stdout.write = origStdout
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
      description: 'A test agent for testing',
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

describe('statusCommand', () => {
  it('reports empty quarantine', async () => {
    const code = await statusCommand({}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('empty')
  })

  it('json output has records array when empty', async () => {
    const code = await statusCommand({ json: true }, home())
    expect(code).toBe(0)
    const out = JSON.parse(stdoutCapture.join('')) as { records: unknown[] }
    expect(out.records).toEqual([])
  })

  it('lists quarantined records', async () => {
    await writeQuarantineRecord(home(), makeRecord('test-agent'))
    const code = await statusCommand({}, home())
    expect(code).toBe(0)
    expect(stdoutCapture.join('')).toContain('test-agent')
  })

  it('json output includes quarantine_id in records', async () => {
    await writeQuarantineRecord(home(), makeRecord('my-agent'))
    const code = await statusCommand({ json: true }, home())
    expect(code).toBe(0)
    const out = JSON.parse(stdoutCapture.join('')) as {
      records: Array<{ quarantine_id: string }>
    }
    expect(out.records).toHaveLength(1)
    expect(out.records[0].quarantine_id).toContain('my-agent')
  })
})
