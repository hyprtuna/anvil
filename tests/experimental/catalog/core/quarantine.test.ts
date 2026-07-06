/**
 * ANV-0028 (P2) — Tests for src/core/catalog/quarantine.ts
 *
 * Covers:
 *  - Path helpers (round-trip per §2 directory layout)
 *  - writeQuarantineRecord happy path
 *  - writeQuarantineRecord rejects duplicate quarantine_id (DuplicateQuarantineError)
 *  - writeQuarantineRecord idempotent overwrite when same quarantine_id
 *  - readQuarantineRecord returns null when absent
 *  - listQuarantineRecords returns all records, skips malformed provenance.json
 *  - dropQuarantineRecord removes slug dir; second call is a no-op
 *  - Atomic write: original file untouched if .tmp exists but rename not done
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DuplicateQuarantineError,
  dropQuarantineRecord,
  listQuarantineRecords,
  quarantineDir,
  quarantineId,
  quarantineRoot,
  readQuarantineRecord,
  sourceDir,
  writeQuarantineRecord,
} from '../../../../src/experimental/catalog/core/quarantine.js'
import type { QuarantineRecord } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

// ─── Fixture factory ─────────────────────────────────────────────────────────

function makeRecord(overrides?: Partial<QuarantineRecord>): QuarantineRecord {
  return {
    quarantine_id: 'wshobson-code-reviewer-abc1234',
    schema_version: '1.0.0',
    created_at: '2026-05-16T00:00:00.000Z',
    source: {
      id: 'wshobson',
      display_name: 'wshobson',
      index_url: 'https://example.com/index.json',
      trust_tier: 'community',
    },
    index_entry: {
      slug: 'code-reviewer',
      display_name: 'Code Reviewer',
      description: 'Reviews code thoroughly',
      upstream_repo: 'wshobson/agents',
      upstream_path: '/',
      upstream_ref: 'abc1234def5678',
      fetch_url: 'https://example.com/code-reviewer.tar.gz',
      fetch_kind: 'tarball',
    },
    provenance: {
      source_id: 'wshobson',
      source_repo: 'wshobson/agents',
      source_path: '/',
      vendored_at: '2026-05-16T00:00:00.000Z',
      upstream_license: 'MIT',
      upstream_version_or_commit: 'abc1234def5678',
      upstream_license_source: 'LICENSE',
    },
    manifest: {
      schema_version: '1.0.0',
      name: 'code-reviewer',
      version: '1.0.0',
      description: 'Reviews code thoroughly',
      kind: 'extension',
      provides: {},
      requires: [],
      compatibility: {
        min_anvil_version: '0.1.0',
      },
    },
    blob_sha256:
      'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
    content_dir: 'content/',
    inventory: [],
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('core/catalog/quarantine', () => {
  let home: string

  beforeEach(() => {
    home = createTestTmpDir('catalog-quarantine')
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  // ─── Path helpers ──────────────────────────────────────────────────────────

  describe('path helpers', () => {
    it('quarantineRoot returns ~/.anvil/extensions/_quarantine/', () => {
      expect(quarantineRoot(home)).toBe(join(home, 'extensions', '_quarantine'))
    })

    it('sourceDir returns _quarantine/<sourceId>/', () => {
      expect(sourceDir(home, 'wshobson')).toBe(
        join(home, 'extensions', '_quarantine', 'wshobson'),
      )
    })

    it('quarantineDir returns _quarantine/<sourceId>/<slug>/', () => {
      expect(quarantineDir(home, 'wshobson', 'code-reviewer')).toBe(
        join(home, 'extensions', '_quarantine', 'wshobson', 'code-reviewer'),
      )
    })

    it('quarantineId returns <source>-<slug>-<shortSha>', () => {
      expect(quarantineId('wshobson', 'code-reviewer', 'abc1234')).toBe(
        'wshobson-code-reviewer-abc1234',
      )
    })
  })

  // ─── writeQuarantineRecord happy path ─────────────────────────────────────

  describe('writeQuarantineRecord', () => {
    it('persists record and provenance.json is readable via readQuarantineRecord', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)

      const dir = quarantineDir(home, 'wshobson', 'code-reviewer')
      expect(existsSync(join(dir, 'provenance.json'))).toBe(true)
      expect(existsSync(join(dir, 'manifest.json'))).toBe(true)
      expect(existsSync(join(dir, 'validation.json'))).toBe(true)
      expect(existsSync(join(dir, 'content'))).toBe(true)

      const read = await readQuarantineRecord(home, 'wshobson', 'code-reviewer')
      expect(read).toEqual(record)
    })

    it('creates content/ subdirectory', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)
      const dir = quarantineDir(home, 'wshobson', 'code-reviewer')
      expect(existsSync(join(dir, 'content'))).toBe(true)
    })

    it('initialises validation.json as empty object {}', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)
      const dir = quarantineDir(home, 'wshobson', 'code-reviewer')
      const raw = await readFile(join(dir, 'validation.json'), 'utf-8')
      expect(JSON.parse(raw)).toEqual({})
    })

    it('throws DuplicateQuarantineError when slug directory has different quarantine_id', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)

      const different = makeRecord({
        quarantine_id: 'wshobson-code-reviewer-different99',
      })
      await expect(
        writeQuarantineRecord(home, different),
      ).rejects.toBeInstanceOf(DuplicateQuarantineError)
    })

    it('DuplicateQuarantineError carries the existing quarantine_id', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)

      const different = makeRecord({
        quarantine_id: 'wshobson-code-reviewer-different99',
      })
      let caught: DuplicateQuarantineError | undefined
      try {
        await writeQuarantineRecord(home, different)
      } catch (err) {
        if (err instanceof DuplicateQuarantineError) caught = err
      }
      expect(caught).toBeDefined()
      expect(caught?.quarantine_id).toBe('wshobson-code-reviewer-abc1234')
    })

    it('idempotent overwrite when same quarantine_id — no error, record updated', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)

      // Same quarantine_id, different blob_sha256 — should overwrite silently
      const updated = makeRecord({
        blob_sha256:
          'cafebabe1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      })
      await expect(
        writeQuarantineRecord(home, updated),
      ).resolves.toBeUndefined()

      const read = await readQuarantineRecord(home, 'wshobson', 'code-reviewer')
      expect(read?.blob_sha256).toBe(updated.blob_sha256)
    })
  })

  // ─── readQuarantineRecord ──────────────────────────────────────────────────

  describe('readQuarantineRecord', () => {
    it('returns null when slug directory does not exist', async () => {
      const result = await readQuarantineRecord(home, 'wshobson', 'nonexistent')
      expect(result).toBeNull()
    })

    it('returns null when provenance.json is absent', async () => {
      const dir = quarantineDir(home, 'wshobson', 'code-reviewer')
      await mkdir(dir, { recursive: true })
      const result = await readQuarantineRecord(
        home,
        'wshobson',
        'code-reviewer',
      )
      expect(result).toBeNull()
    })
  })

  // ─── listQuarantineRecords ─────────────────────────────────────────────────

  describe('listQuarantineRecords', () => {
    it('returns all valid records across sources', async () => {
      const r1 = makeRecord()
      const r2 = makeRecord({
        quarantine_id: 'wshobson-linter-bbb2345',
        index_entry: {
          slug: 'linter',
          display_name: 'Linter',
          description: 'Lints code',
          upstream_repo: 'wshobson/agents',
          upstream_path: '/',
          upstream_ref: 'bbb2345ccc6789',
          fetch_url: 'https://example.com/linter.tar.gz',
          fetch_kind: 'tarball',
        },
        manifest: {
          schema_version: '1.0.0',
          name: 'linter',
          version: '1.0.0',
          description: 'Lints code',
          kind: 'extension',
          provides: {},
          requires: [],
          compatibility: { min_anvil_version: '0.1.0' },
        },
      })
      await writeQuarantineRecord(home, r1)
      await writeQuarantineRecord(home, r2)

      const list = await listQuarantineRecords(home)
      expect(list).toHaveLength(2)
      const ids = list.map((r) => r.quarantine_id).sort()
      expect(ids).toEqual([r1.quarantine_id, r2.quarantine_id].sort())
    })

    it('skips directories with malformed provenance.json without throwing', async () => {
      const r1 = makeRecord()
      await writeQuarantineRecord(home, r1)

      // Write a malformed provenance.json for a second slug
      const badDir = quarantineDir(home, 'wshobson', 'broken-slug')
      await mkdir(badDir, { recursive: true })
      await writeFile(
        join(badDir, 'provenance.json'),
        'not valid json',
        'utf-8',
      )

      const list = await listQuarantineRecords(home)
      expect(list).toHaveLength(1)
      expect(list[0].quarantine_id).toBe(r1.quarantine_id)
    })

    it('returns empty array when quarantine root does not exist', async () => {
      const list = await listQuarantineRecords(home)
      expect(list).toEqual([])
    })
  })

  // ─── dropQuarantineRecord ─────────────────────────────────────────────────

  describe('dropQuarantineRecord', () => {
    it('removes the slug directory', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)

      const dir = quarantineDir(home, 'wshobson', 'code-reviewer')
      expect(existsSync(dir)).toBe(true)

      await dropQuarantineRecord(home, 'wshobson', 'code-reviewer')
      expect(existsSync(dir)).toBe(false)
    })

    it('is idempotent — second call is a no-op', async () => {
      await expect(
        dropQuarantineRecord(home, 'wshobson', 'nonexistent'),
      ).resolves.toBeUndefined()
    })
  })

  // ─── Atomic write safety ──────────────────────────────────────────────────

  describe('atomic write safety', () => {
    it('original provenance.json untouched when .tmp file exists but rename has not happened', async () => {
      const record = makeRecord()
      await writeQuarantineRecord(home, record)

      const dir = quarantineDir(home, 'wshobson', 'code-reviewer')
      const provenancePath = join(dir, 'provenance.json')

      // Simulate a partial write by writing to the .tmp path directly
      // without completing the rename — the original must be intact
      const tmpPath = `${provenancePath}.tmp`
      await writeFile(tmpPath, '{"broken": true}', 'utf-8')

      // Reading the original should still return the original record
      const read = await readQuarantineRecord(home, 'wshobson', 'code-reviewer')
      expect(read?.quarantine_id).toBe(record.quarantine_id)
    })
  })
})
