/**
 * ANV-0028 (P5) — Doctor rows "Catalog quarantine" + "Catalog cache" — unit tests.
 *
 * Tests the pure builder `buildCatalogDoctorRows` exhaustively.
 * One integration section exercises `pushCatalogChecks` via a real tmpdir.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CacheMeta } from '../../../src/experimental/catalog/core/cache.js'
import { writeIndexAtomic } from '../../../src/experimental/catalog/core/cache.js'
import {
  quarantineDir,
  quarantineRoot,
  writeQuarantineRecord,
} from '../../../src/experimental/catalog/core/quarantine.js'
import type {
  CatalogIndex,
  QuarantineRecord,
} from '../../../src/experimental/catalog/core/types.js'
import {
  buildCatalogDoctorRows,
  pushCatalogChecks,
} from '../../../src/experimental/catalog/doctor-checks.js'
import { createTestTmpDir } from '../../helpers/tmpdir.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2026-05-17T12:00:00Z')
const ONE_HOUR_AGO = new Date(NOW.getTime() - 60 * 60 * 1000).toISOString()
const THIRTY_HOURS_AGO = new Date(
  NOW.getTime() - 30 * 60 * 60 * 1000,
).toISOString()

function makeRecord(
  overrides: Partial<QuarantineRecord> = {},
): QuarantineRecord {
  return {
    quarantine_id: 'wshobson-test-ext-abc12345',
    schema_version: '1.0.0',
    created_at: NOW.toISOString(),
    source: {
      id: 'wshobson',
      display_name: 'wshobson/agents',
      index_url: 'https://example.com/INDEX.json',
      trust_tier: 'community',
    },
    index_entry: {
      slug: 'test-ext',
      display_name: 'Test Extension',
      description: 'A test extension for unit tests',
      upstream_repo: 'wshobson/agents',
      upstream_path: 'test-ext',
      upstream_ref: 'abc12345',
      fetch_url: 'https://example.com/test-ext.tar.gz',
      fetch_kind: 'tarball',
    },
    provenance: {
      source_id: 'wshobson',
      source_repo: 'wshobson/agents',
      source_path: 'test-ext',
      vendored_at: NOW.toISOString(),
      upstream_license: 'MIT',
      upstream_version_or_commit: 'abc12345',
      upstream_license_source: 'declared',
    },
    manifest: {
      schema_version: '1.0.0',
      name: 'test-ext',
      version: '1.0.0',
      description: 'Test extension',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: { min_anvil_version: '0.1.0' },
    },
    blob_sha256: 'abc12345deadbeef',
    content_dir: 'content/',
    inventory: [],
    ...overrides,
  }
}

const FRESH_META: CacheMeta = { last_success: ONE_HOUR_AGO }
const STALE_META: CacheMeta = { last_success: THIRTY_HOURS_AGO }
const EMPTY_META: CacheMeta = {}

// ---------------------------------------------------------------------------
// Pure builder tests — quarantine-state row
// ---------------------------------------------------------------------------

describe('buildCatalogDoctorRows — quarantine-state', () => {
  const baseArgs = {
    quarantineDecisions: {},
    cacheMeta: { wshobson: FRESH_META },
    offlineMode: false,
    sourceCount: 1,
    now: NOW,
  }

  it('skips when _quarantine/ directory is absent', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [],
      quarantineDirAbsent: true,
    })
    expect(rows.quarantineState.status).toBe('skip')
    expect(rows.quarantineState.expectedAbsence).toBe(true)
    expect(rows.quarantineState.detail).toContain('absent')
  })

  it('passes when quarantine is empty (dir exists but no records)', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [],
      quarantineDirAbsent: false,
    })
    expect(rows.quarantineState.status).toBe('pass')
    expect(rows.quarantineState.detail).toContain('empty')
  })

  it('passes when all records have decision=promoted', () => {
    const record = makeRecord()
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [record],
      quarantineDirAbsent: false,
      quarantineDecisions: { [record.quarantine_id]: 'promoted' },
    })
    expect(rows.quarantineState.status).toBe('pass')
    expect(rows.quarantineState.detail).toContain('all promoted')
  })

  it('warns when ≥1 record has no decision (pending)', () => {
    const record = makeRecord()
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [record],
      quarantineDirAbsent: false,
      quarantineDecisions: {}, // no decision
    })
    expect(rows.quarantineState.status).toBe('warn')
    expect(rows.quarantineState.detail).toContain('pending review')
  })

  it('warns when ≥1 record has decision=warned-but-promoted', () => {
    const record = makeRecord()
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [record],
      quarantineDirAbsent: false,
      quarantineDecisions: { [record.quarantine_id]: 'warned-but-promoted' },
    })
    expect(rows.quarantineState.status).toBe('warn')
  })

  it('fails when ≥1 record has decision=blocked', () => {
    const record = makeRecord()
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [record],
      quarantineDirAbsent: false,
      quarantineDecisions: { [record.quarantine_id]: 'blocked' },
    })
    expect(rows.quarantineState.status).toBe('fail')
    expect(rows.quarantineState.detail).toContain('blocked')
  })

  it('fails (blocked) wins over warn (pending) when both present', () => {
    const r1 = makeRecord({ quarantine_id: 'wshobson-r1-aaa' })
    const r2 = makeRecord({ quarantine_id: 'wshobson-r2-bbb' })
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      quarantineRecords: [r1, r2],
      quarantineDirAbsent: false,
      quarantineDecisions: {
        [r1.quarantine_id]: 'blocked',
        // r2 has no decision
      },
    })
    expect(rows.quarantineState.status).toBe('fail')
  })
})

// ---------------------------------------------------------------------------
// Pure builder tests — cache-health row
// ---------------------------------------------------------------------------

describe('buildCatalogDoctorRows — cache-health', () => {
  const baseArgs = {
    quarantineRecords: [],
    quarantineDirAbsent: true,
    quarantineDecisions: {},
    offlineMode: false,
    sourceCount: 1,
    now: NOW,
  }

  it('skips when offline mode is active', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: {},
      offlineMode: true,
    })
    expect(rows.cacheHealth.status).toBe('skip')
    expect(rows.cacheHealth.expectedAbsence).toBe(true)
    expect(rows.cacheHealth.detail).toContain('offline mode')
  })

  it('skips when no sources are configured', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: {},
      sourceCount: 0,
    })
    expect(rows.cacheHealth.status).toBe('skip')
    expect(rows.cacheHealth.expectedAbsence).toBe(true)
    expect(rows.cacheHealth.detail).toContain('no catalog sources')
  })

  it('passes when all sources are fresh (last_success < 24h)', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: { wshobson: FRESH_META },
    })
    expect(rows.cacheHealth.status).toBe('pass')
    expect(rows.cacheHealth.detail).toContain('fresh')
  })

  it('warns when ≥1 source has stale last_success (> 24h)', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: { wshobson: STALE_META },
    })
    expect(rows.cacheHealth.status).toBe('warn')
    expect(rows.cacheHealth.detail).toContain('stale')
    expect(rows.cacheHealth.detail).toContain('wshobson')
  })

  it('warns when last_success is absent (never fetched)', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: { wshobson: EMPTY_META },
    })
    expect(rows.cacheHealth.status).toBe('warn')
    expect(rows.cacheHealth.detail).toContain('never fetched')
  })

  it('warns when ≥1 of multiple sources is stale', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: {
        source1: FRESH_META,
        source2: STALE_META,
      },
      sourceCount: 2,
    })
    expect(rows.cacheHealth.status).toBe('warn')
  })

  it('passes when all of multiple sources are fresh', () => {
    const rows = buildCatalogDoctorRows({
      ...baseArgs,
      cacheMeta: {
        source1: FRESH_META,
        source2: FRESH_META,
      },
      sourceCount: 2,
    })
    expect(rows.cacheHealth.status).toBe('pass')
  })
})

// ---------------------------------------------------------------------------
// I/O wrapper integration — pushCatalogChecks
// ---------------------------------------------------------------------------

describe('pushCatalogChecks — I/O integration', () => {
  let tmpDir: string
  let origOffline: string | undefined

  beforeEach(() => {
    tmpDir = createTestTmpDir('anvil-catalog-doctor-test')
    origOffline = process.env.ANVIL_OFFLINE
  })

  afterEach(() => {
    if (origOffline === undefined) {
      process.env.ANVIL_OFFLINE = undefined
    } else {
      process.env.ANVIL_OFFLINE = origOffline
    }
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('emits skip rows (expectedAbsence) when _quarantine/ absent and ANVIL_OFFLINE=1', async () => {
    process.env.ANVIL_OFFLINE = '1'
    const checks: Array<{
      name: string
      status: string
      expectedAbsence?: boolean
    }> = []
    await pushCatalogChecks(
      checks as Parameters<typeof pushCatalogChecks>[0],
      tmpDir,
    )

    expect(checks).toHaveLength(2)
    const quarantineRow = checks.find((c) => c.name === 'Catalog quarantine')
    const cacheRow = checks.find((c) => c.name === 'Catalog cache')

    expect(quarantineRow?.status).toBe('skip')
    expect(quarantineRow?.expectedAbsence).toBe(true)
    expect(cacheRow?.status).toBe('skip')
    expect(cacheRow?.expectedAbsence).toBe(true)
  })

  it('emits pass for quarantine when empty dir exists, warn for stale cache', async () => {
    process.env.ANVIL_OFFLINE = undefined
    // Create the quarantine root so it's not absent
    mkdirSync(quarantineRoot(tmpDir), { recursive: true })

    const checks: Array<{ name: string; status: string }> = []
    await pushCatalogChecks(
      checks as Parameters<typeof pushCatalogChecks>[0],
      tmpDir,
    )

    const quarantineRow = checks.find((c) => c.name === 'Catalog quarantine')
    const cacheRow = checks.find((c) => c.name === 'Catalog cache')

    expect(quarantineRow?.status).toBe('pass')
    // No cache meta exists → stale
    expect(cacheRow?.status).toBe('warn')
  })

  it('emits pass for cache when index was recently fetched', async () => {
    process.env.ANVIL_OFFLINE = undefined

    // Write a fresh cache meta by writing an index (which writes meta.last_success)
    const freshIndex: CatalogIndex = {
      source_id: 'wshobson',
      schema_version: '1.0.0',
      fetched_at: new Date().toISOString(),
      entries: [],
    }
    await writeIndexAtomic(tmpDir, 'wshobson', freshIndex)

    const checks: Array<{ name: string; status: string }> = []
    await pushCatalogChecks(
      checks as Parameters<typeof pushCatalogChecks>[0],
      tmpDir,
    )

    const cacheRow = checks.find((c) => c.name === 'Catalog cache')
    expect(cacheRow?.status).toBe('pass')
  })

  it('emits fail for quarantine when a record has blocked decision', async () => {
    process.env.ANVIL_OFFLINE = undefined

    const record = makeRecord()
    await writeQuarantineRecord(tmpDir, record)

    // Write blocked decision into validation.json
    const valPath = join(
      quarantineDir(tmpDir, record.source.id, record.index_entry.slug),
      'validation.json',
    )
    writeFileSync(valPath, JSON.stringify({ decision: 'blocked' }))

    const checks: Array<{ name: string; status: string }> = []
    await pushCatalogChecks(
      checks as Parameters<typeof pushCatalogChecks>[0],
      tmpDir,
    )

    const quarantineRow = checks.find((c) => c.name === 'Catalog quarantine')
    expect(quarantineRow?.status).toBe('fail')
  })
})
