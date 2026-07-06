/**
 * ANV-0028 (P1) — Tests for src/core/catalog/cache.ts
 */

import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  blobPath,
  cacheRoot,
  indexPath,
  metaPath,
  readBlob,
  readIndex,
  recordFetchAttempt,
  writeBlob,
  writeIndexAtomic,
} from '../../../../src/experimental/catalog/core/cache.js'
import type { CatalogIndex } from '../../../../src/experimental/catalog/core/types.js'
import { createTestTmpDir } from '../../../helpers/tmpdir.js'

describe('core/catalog/cache', () => {
  let home: string

  beforeEach(() => {
    home = createTestTmpDir('catalog-cache')
  })

  afterEach(async () => {
    await rm(home, { recursive: true, force: true })
  })

  // ─── Path helpers ─────────────────────────────────────────────────────────

  describe('path helpers', () => {
    it('cacheRoot returns ~/.anvil/extensions/_cache/', () => {
      const root = cacheRoot(home)
      expect(root).toBe(join(home, 'extensions', '_cache'))
    })

    it('indexPath returns _cache/index/<source>.json', () => {
      const p = indexPath(home, 'wshobson')
      expect(p).toBe(
        join(home, 'extensions', '_cache', 'index', 'wshobson.json'),
      )
    })

    it('blobPath returns _cache/blobs/<sha256>', () => {
      const sha = 'abc123def456'
      const p = blobPath(home, sha)
      expect(p).toBe(join(home, 'extensions', '_cache', 'blobs', sha))
    })

    it('metaPath returns _cache/meta/<source>.json', () => {
      const p = metaPath(home, 'wshobson')
      expect(p).toBe(
        join(home, 'extensions', '_cache', 'meta', 'wshobson.json'),
      )
    })
  })

  // ─── Index read/write ─────────────────────────────────────────────────────

  describe('index operations', () => {
    const index: CatalogIndex = {
      source_id: 'wshobson',
      schema_version: '1.0.0',
      fetched_at: '2026-05-16T00:00:00.000Z',
      entries: [],
    }

    it('writeIndexAtomic then readIndex returns the same data', async () => {
      await writeIndexAtomic(home, 'wshobson', index)
      const result = await readIndex(home, 'wshobson')
      expect(result).toEqual(index)
    })

    it('readIndex returns null when index does not exist', async () => {
      const result = await readIndex(home, 'nonexistent')
      expect(result).toBeNull()
    })

    it('writeIndexAtomic updates meta with last_success', async () => {
      await writeIndexAtomic(home, 'wshobson', index)
      const metaRaw = await readFile(metaPath(home, 'wshobson'), 'utf-8')
      const meta = JSON.parse(metaRaw) as { last_success: string }
      expect(meta.last_success).toBeDefined()
      // Should be a valid ISO8601 date
      expect(new Date(meta.last_success).toISOString()).toBe(meta.last_success)
    })

    it('atomic write: .tmp file does not persist after success', async () => {
      await writeIndexAtomic(home, 'wshobson', index)
      const tmpPath = `${indexPath(home, 'wshobson')}.tmp`
      expect(existsSync(tmpPath)).toBe(false)
    })

    it('atomic write safety: if old index exists, partial write leaves old intact', async () => {
      // Write initial index
      await writeIndexAtomic(home, 'wshobson', index)

      // Simulate a partial write by writing to .tmp directly without renaming
      const tmpPath = `${indexPath(home, 'wshobson')}.tmp`
      await writeFile(tmpPath, 'CORRUPT', 'utf-8')

      // Old index should still be readable
      const result = await readIndex(home, 'wshobson')
      expect(result).toEqual(index)
    })
  })

  // ─── Blob operations ──────────────────────────────────────────────────────

  describe('blob operations', () => {
    const sha256 = 'a'.repeat(64) // 64-char hex string
    const data = new Uint8Array([1, 2, 3, 4, 5])

    it('writeBlob then readBlob returns the same bytes', async () => {
      await writeBlob(home, sha256, data)
      const result = await readBlob(home, sha256)
      expect(result).toEqual(data)
    })

    it('readBlob returns null when blob does not exist', async () => {
      const result = await readBlob(home, 'nonexistent-sha')
      expect(result).toBeNull()
    })

    it('SHA256 path derivation is deterministic', () => {
      const sha = 'deadbeef'.repeat(8) // 64 chars
      const p1 = blobPath(home, sha)
      const p2 = blobPath(home, sha)
      expect(p1).toBe(p2)
    })

    it('different SHAs produce different paths', () => {
      const sha1 = 'a'.repeat(64)
      const sha2 = 'b'.repeat(64)
      expect(blobPath(home, sha1)).not.toBe(blobPath(home, sha2))
    })
  })

  // ─── Meta / fetch attempts ────────────────────────────────────────────────

  describe('recordFetchAttempt', () => {
    it('records last_attempt on failure', async () => {
      await recordFetchAttempt(home, 'wshobson', false)
      const metaRaw = await readFile(metaPath(home, 'wshobson'), 'utf-8')
      const meta = JSON.parse(metaRaw) as {
        last_attempt: string
        last_success?: string
      }
      expect(meta.last_attempt).toBeDefined()
      expect(new Date(meta.last_attempt).toISOString()).toBe(meta.last_attempt)
      expect(meta.last_success).toBeUndefined()
    })

    it('records both last_attempt and last_success on success', async () => {
      await recordFetchAttempt(home, 'wshobson', true)
      const metaRaw = await readFile(metaPath(home, 'wshobson'), 'utf-8')
      const meta = JSON.parse(metaRaw) as {
        last_attempt: string
        last_success: string
      }
      expect(meta.last_attempt).toBeDefined()
      expect(meta.last_success).toBeDefined()
    })

    it('preserves last_success across failed attempts', async () => {
      // First a success
      await recordFetchAttempt(home, 'wshobson', true)
      const metaAfterSuccess = JSON.parse(
        await readFile(metaPath(home, 'wshobson'), 'utf-8'),
      ) as { last_success: string }
      const successTime = metaAfterSuccess.last_success

      // Then a failure
      await recordFetchAttempt(home, 'wshobson', false)
      const metaAfterFailure = JSON.parse(
        await readFile(metaPath(home, 'wshobson'), 'utf-8'),
      ) as { last_success: string; last_attempt: string }

      // last_success should still be there from before
      expect(metaAfterFailure.last_success).toBe(successTime)
      // last_attempt should be updated
      expect(metaAfterFailure.last_attempt).toBeDefined()
    })
  })
})
