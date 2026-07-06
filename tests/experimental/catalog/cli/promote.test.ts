/**
 * Tests for `anvil catalog promote`.
 *
 * Integration test that verifies:
 *   1. Quarantine record + content/ dir setup.
 *   2. promoteCommand invocation.
 *   3. Extension installed to ~/.anvil/extensions/<name>/.
 *   4. validation.json updated.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promoteCommand } from '../../../../src/experimental/catalog/cli/promote.js'
import {
  quarantineDir,
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
  tmpBase = createTestTmpDir('anvil-catalog-promote-test')
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

/**
 * Build a QuarantineRecord + write content/ directory with a valid manifest.
 */
async function setupQuarantineWithContent(
  slug: string,
): Promise<QuarantineRecord> {
  const record: QuarantineRecord = {
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
      description: 'A test agent for testing purposes in catalog',
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
      description: 'A test agent for catalog promote',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: { min_anvil_version: '0.1.0' },
    },
    blob_sha256: 'a'.repeat(64),
    content_dir: 'content/',
    inventory: [],
  }

  await writeQuarantineRecord(home(), record)

  // Write content/ directory with a valid manifest.json so installFromDirectory works
  const contentDir = join(quarantineDir(home(), 'wshobson', slug), 'content')
  await mkdir(contentDir, { recursive: true })
  await writeFile(
    join(contentDir, 'manifest.json'),
    `${JSON.stringify({
      schema_version: '1.0.0',
      name: slug,
      version: '1.0.0',
      description: 'A test agent for catalog promote',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: { min_anvil_version: '0.1.0' },
    })}\n`,
    'utf-8',
  )

  return record
}

describe('promoteCommand', () => {
  it('exits 1 on empty quarantine-id', async () => {
    const code = await promoteCommand('', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('must not be empty')
  })

  it('exits 1 when quarantine-id not found', async () => {
    const code = await promoteCommand('nonexistent-qid', {}, home())
    expect(code).toBe(1)
    expect(stderrCapture.join('')).toContain('no quarantine record')
  })

  it('installs the extension when validation passes', async () => {
    await setupQuarantineWithContent('test-promote-agent')
    const code = await promoteCommand(
      'wshobson-test-promote-agent-abc12345',
      {},
      home(),
    )
    expect(code).toBe(0)

    // Extension directory should exist
    const extDir = join(home(), 'extensions', 'test-promote-agent')
    expect(existsSync(extDir)).toBe(true)
    // manifest.json should be present
    expect(existsSync(join(extDir, 'manifest.json'))).toBe(true)
  })

  it('updates validation.json after promotion', async () => {
    await setupQuarantineWithContent('validate-check-agent')
    const code = await promoteCommand(
      'wshobson-validate-check-agent-abc12345',
      {},
      home(),
    )
    expect(code).toBe(0)

    const vPath = join(
      quarantineDir(home(), 'wshobson', 'validate-check-agent'),
      'validation.json',
    )
    const raw = await readFile(vPath, 'utf-8')
    const parsed = JSON.parse(raw) as {
      promoted_at?: string
      decision?: string
    }
    // validation.json should have been updated
    expect(
      parsed.decision !== undefined || parsed.promoted_at !== undefined,
    ).toBe(true)
  })

  it('json output includes quarantine_id', async () => {
    await setupQuarantineWithContent('json-promote-agent')
    const code = await promoteCommand(
      'wshobson-json-promote-agent-abc12345',
      { json: true },
      home(),
    )
    expect(code).toBe(0)
    const out = JSON.parse(stdoutCapture.join('')) as { quarantine_id: string }
    expect(out.quarantine_id).toBe('wshobson-json-promote-agent-abc12345')
  })
})
