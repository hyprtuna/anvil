/**
 * ANV-0028 (P5) — Catalog round-trip integration test.
 *
 * Spins up an in-process HTTP fake server on 127.0.0.1:0, exercises the full
 * lifecycle: refresh → search → fetch → promote → doctor --catalog.
 *
 * Negative path: set ANVIL_OFFLINE=1, run refresh again → cache row reports stale.
 *
 * All I/O is rooted at a tmpdir ANVIL_HOME; no real network calls are made.
 *
 * Test seam: `_setBuiltInSourcesForTest` / `getBuiltInSources` in sources.ts
 * (documented in that module).
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readIndex } from '../../../../src/experimental/catalog/core/cache.js'
import {
  _setBuiltInSourcesForTest,
  getBuiltInSources,
} from '../../../../src/experimental/catalog/core/sources.js'
import type { CatalogIndex } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Create a tiny tar.gz in tmpDir containing manifest.json + skills/test.md */
function createMinimalTarGz(stagingDir: string): Buffer {
  // Create the source tree
  const srcDir = join(stagingDir, 'archive-src')
  mkdirSync(join(srcDir, 'skills'), { recursive: true })
  writeFileSync(
    join(srcDir, 'manifest.json'),
    JSON.stringify({
      schema_version: '1.0.0',
      name: 'test-catalog-ext',
      version: '1.0.0',
      description: 'Integration test catalog extension',
      kind: 'extension',
      provides: { skill: ['test-catalog-skill'] },
      requires: [],
      compatibility: { min_anvil_version: '0.1.0' },
    }),
  )
  writeFileSync(
    join(srcDir, 'skills', 'test-catalog-skill.md'),
    '# Test Catalog Skill\n\nA skill for integration testing.\n',
  )

  const archivePath = join(stagingDir, 'test-ext.tar.gz')
  // Use system tar to create the archive (same as production extraction path)
  execSync(`tar -czf "${archivePath}" -C "${srcDir}" .`)
  const { readFileSync } = require('node:fs')
  return readFileSync(archivePath)
}

/** Start an in-process HTTP server that serves a synthetic catalog. */
function startFakeServer(
  tarGzBuffer: Buffer,
): Promise<{ server: Server; baseUrl: string }> {
  const INDEX: CatalogIndex = {
    source_id: 'test-catalog',
    schema_version: '1.0.0',
    fetched_at: new Date().toISOString(),
    entries: [
      {
        slug: 'test-catalog-ext',
        display_name: 'Test Catalog Extension',
        description: 'A catalog extension created for integration testing',
        upstream_repo: 'test-org/test-repo',
        upstream_path: 'test-catalog-ext',
        upstream_ref: 'abc1234deadbeef',
        fetch_url: 'PLACEHOLDER', // filled in after server starts
        fetch_kind: 'tarball',
        declared_license: 'MIT',
      },
    ],
  }

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end()
        return
      }

      if (req.url === '/INDEX.json') {
        const body = JSON.stringify(INDEX)
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        })
        res.end(body)
        return
      }

      if (req.url === '/test-ext.tar.gz') {
        res.writeHead(200, {
          'Content-Type': 'application/gzip',
          'Content-Length': tarGzBuffer.length,
        })
        res.end(tarGzBuffer)
        return
      }

      res.writeHead(404)
      res.end()
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'))
        return
      }
      const baseUrl = `http://127.0.0.1:${addr.port}`
      // Patch INDEX entry fetch_url now that we know the port
      INDEX.entries[0].fetch_url = `${baseUrl}/test-ext.tar.gz`
      resolve({ server, baseUrl })
    })

    server.on('error', reject)
  })
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe('catalog round-trip (in-process HTTP fake)', () => {
  let tmpHome: string
  let stagingDir: string
  let server: Server
  let baseUrl: string
  let tarGzBuffer: Buffer
  let originalSources: ReturnType<typeof getBuiltInSources>
  let origOffline: string | undefined
  let quarantineId: string

  beforeAll(async () => {
    tmpHome = createTestTmpDir('anvil-catalog-roundtrip')
    stagingDir = createTestTmpDir('anvil-catalog-staging')

    // Build the fake tar.gz archive
    tarGzBuffer = createMinimalTarGz(stagingDir)

    // Start the fake HTTP server
    const result = await startFakeServer(tarGzBuffer)
    server = result.server
    baseUrl = result.baseUrl

    // Install the test seam: replace BUILTIN_SOURCES with our fake source
    originalSources = getBuiltInSources()
    _setBuiltInSourcesForTest([
      {
        id: 'test-catalog',
        display_name: 'Test Catalog',
        index_url: `${baseUrl}/INDEX.json`,
        trust_tier: 'community',
      },
    ])

    origOffline = process.env.ANVIL_OFFLINE
    process.env.ANVIL_OFFLINE = undefined
    // Allow HTTP for in-process test server (never set in production)
    process.env.ANVIL_ALLOW_HTTP_TESTING = '1'
  })

  afterAll(async () => {
    // Restore the original source list
    _setBuiltInSourcesForTest(originalSources)
    process.env.ANVIL_ALLOW_HTTP_TESTING = undefined

    if (origOffline === undefined) {
      process.env.ANVIL_OFFLINE = undefined
    } else {
      process.env.ANVIL_OFFLINE = origOffline
    }

    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(tmpHome, { recursive: true, force: true })
    await rm(stagingDir, { recursive: true, force: true })
  })

  // 1. refresh → cache index written
  it('step 1: refresh writes cached index', async () => {
    const { refreshCommand } = await import(
      '../../../../src/experimental/catalog/cli/refresh.js'
    )
    const code = await refreshCommand({}, tmpHome)
    expect(code).toBe(0)

    const index = await readIndex(tmpHome, 'test-catalog')
    expect(index).not.toBeNull()
    expect(index?.entries).toHaveLength(1)
    expect(index?.entries[0]?.slug).toBe('test-catalog-ext')
  })

  // 2. search → returns the entry
  it('step 2: search returns the catalog entry', async () => {
    const { searchCommand } = await import(
      '../../../../src/experimental/catalog/cli/search.js'
    )

    const hits: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      hits.push(String(chunk))
      return true
    }

    const code = await searchCommand('integration', {}, tmpHome)

    process.stdout.write = origWrite

    expect(code).toBe(0)
    expect(hits.join('')).toContain('test-catalog-ext')
  })

  // 3. fetch → blob cached, quarantine record written, content/ extracted
  it('step 3: fetch downloads and extracts into quarantine', async () => {
    const { fetchCommand } = await import(
      '../../../../src/experimental/catalog/cli/fetch.js'
    )

    const output: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      output.push(String(chunk))
      return true
    }

    const code = await fetchCommand(
      'test-catalog:test-catalog-ext',
      {},
      tmpHome,
    )

    process.stdout.write = origWrite

    expect(code).toBe(0)

    const outText = output.join('')
    expect(outText).toContain('test-catalog-ext')

    // Extract quarantine_id for later steps
    const qIdMatch = outText.match(/quarantine_id\s*:\s*(\S+)/)
    expect(qIdMatch).not.toBeNull()
    quarantineId = qIdMatch![1]

    // Verify quarantine record was written
    const { listQuarantineRecords } = await import(
      '../../../../src/experimental/catalog/core/quarantine.js'
    )
    const records = await listQuarantineRecords(tmpHome)
    expect(records).toHaveLength(1)
    expect(records[0]?.source.id).toBe('test-catalog')
    expect(records[0]?.index_entry.slug).toBe('test-catalog-ext')

    // Verify content/ was extracted (manifest.json should be there from the archive)
    const contentManifest = join(
      tmpHome,
      'extensions',
      '_quarantine',
      'test-catalog',
      'test-catalog-ext',
      'content',
      'manifest.json',
    )
    expect(existsSync(contentManifest)).toBe(true)
  })

  // 4. promote → validators run, extension lands in ~/.anvil/extensions/
  it('step 4: promote installs the extension', async () => {
    expect(quarantineId).toBeTruthy()

    const { promoteCommand } = await import(
      '../../../../src/experimental/catalog/cli/promote.js'
    )

    const output: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: unknown) => {
      output.push(String(chunk))
      return true
    }

    const code = await promoteCommand(quarantineId, {}, tmpHome)

    process.stdout.write = origWrite

    // Extension may be promoted (0) or blocked (3) depending on validators.
    // For our minimal test extension, expect success.
    const outText = output.join('')
    expect(code).toBe(0)
    expect(outText).toContain('test-catalog-ext')

    // Verify extension directory exists
    const extDir = join(tmpHome, 'extensions', 'test-catalog-ext')
    expect(existsSync(extDir)).toBe(true)
    expect(existsSync(join(extDir, 'manifest.json'))).toBe(true)
  })

  // 5. anvil doctor --catalog → both rows in pass state
  it('step 5: doctor catalog rows report pass', async () => {
    const { pushCatalogChecks } = await import(
      '../../../../src/experimental/catalog/doctor-checks.js'
    )

    const checks: Array<{ name: string; status: string }> = []
    await pushCatalogChecks(
      checks as Parameters<typeof pushCatalogChecks>[0],
      tmpHome,
    )

    const quarantineRow = checks.find((c) => c.name === 'Catalog quarantine')
    const cacheRow = checks.find((c) => c.name === 'Catalog cache')

    // Quarantine: all promoted → pass (or empty → pass)
    expect(['pass', 'warn']).toContain(quarantineRow?.status)
    // Cache: index was fetched < 24h ago → pass
    expect(cacheRow?.status).toBe('pass')
  })

  // 6. Negative path: ANVIL_OFFLINE=1 → cache row reports stale warning
  it('step 6 (negative): ANVIL_OFFLINE=1 cache row skips with expectedAbsence', async () => {
    process.env.ANVIL_OFFLINE = '1'

    const { pushCatalogChecks } = await import(
      '../../../../src/experimental/catalog/doctor-checks.js'
    )

    const checks: Array<{
      name: string
      status: string
      expectedAbsence?: boolean
    }> = []
    await pushCatalogChecks(
      checks as Parameters<typeof pushCatalogChecks>[0],
      tmpHome,
    )

    process.env.ANVIL_OFFLINE = undefined

    const cacheRow = checks.find((c) => c.name === 'Catalog cache')
    expect(cacheRow?.status).toBe('skip')
    expect(cacheRow?.expectedAbsence).toBe(true)
    expect(cacheRow?.status).not.toBe('fail')
  })

  // 6b. Negative path: offline refresh exits 4
  it('step 6b (negative): refresh with ANVIL_OFFLINE=1 exits 4', async () => {
    process.env.ANVIL_OFFLINE = '1'

    const { refreshCommand } = await import(
      '../../../../src/experimental/catalog/cli/refresh.js'
    )
    const code = await refreshCommand({}, tmpHome)

    process.env.ANVIL_OFFLINE = undefined

    expect(code).toBe(4) // EXIT_OFFLINE
  })
})
