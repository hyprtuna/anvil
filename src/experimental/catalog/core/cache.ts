/**
 * ANV-0028 (P1) — SHA256-named blob cache for catalog artifacts.
 *
 * Layer 0 — filesystem I/O only; no network.
 *
 * Layout under anvilHome (= ~/.anvil/):
 *   extensions/_cache/
 *     index/<source>.json      ← latest catalog index (atomic-renamed)
 *     blobs/<sha256>           ← content-addressed body store
 *     meta/<source>.json       ← TTL / last-success / last-attempt metadata
 *     .lock                    ← sentinel file for write serialisation
 *
 * Write pattern: write to .tmp → fsync → rename (POSIX atomic).
 * Reads are lock-free (atomic rename guarantees consistency).
 */

import { constants } from 'node:fs'
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { CatalogIndex } from './types.js'

// ─── Path helpers ─────────────────────────────────────────────────────────

/** Root of the cache directory: ~/.anvil/extensions/_cache/ */
export function cacheRoot(anvilHome: string): string {
  return join(anvilHome, 'extensions', '_cache')
}

/** Path to a cached catalog index: _cache/index/<sourceId>.json */
export function indexPath(anvilHome: string, sourceId: string): string {
  return join(cacheRoot(anvilHome), 'index', `${sourceId}.json`)
}

/** Path to a content-addressed blob: _cache/blobs/<sha256> */
export function blobPath(anvilHome: string, sha256: string): string {
  return join(cacheRoot(anvilHome), 'blobs', sha256)
}

/** Path to source metadata: _cache/meta/<sourceId>.json */
export function metaPath(anvilHome: string, sourceId: string): string {
  return join(cacheRoot(anvilHome), 'meta', `${sourceId}.json`)
}

/** Sentinel lock file for write serialisation. */
function lockPath(anvilHome: string): string {
  return join(cacheRoot(anvilHome), '.lock')
}

// ─── Lock helpers ─────────────────────────────────────────────────────────

async function acquireLock(anvilHome: string): Promise<void> {
  const lp = lockPath(anvilHome)
  await mkdir(dirname(lp), { recursive: true })
  const MAX_ATTEMPTS = 20
  let delay = 25

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const fh = await open(
        lp,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      )
      await fh.writeFile(String(process.pid))
      await fh.close()
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 2, 500)
    }
  }
  throw new Error(
    `anvil-catalog-cache: could not acquire lock at ${lp} after ${MAX_ATTEMPTS} attempts`,
  )
}

async function releaseLock(anvilHome: string): Promise<void> {
  try {
    await unlink(lockPath(anvilHome))
  } catch {
    // Ignore: lock may have already been removed
  }
}

// ─── Atomic write helper ──────────────────────────────────────────────────

async function atomicWriteText(
  targetPath: string,
  content: string,
): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(tmpPath, content, 'utf-8')
  const fh = await open(tmpPath, 'r+')
  await fh.sync()
  await fh.close()
  await rename(tmpPath, targetPath)
}

async function atomicWriteBytes(
  targetPath: string,
  bytes: Uint8Array,
): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(tmpPath, bytes)
  const fh = await open(tmpPath, 'r+')
  await fh.sync()
  await fh.close()
  await rename(tmpPath, targetPath)
}

// ─── Meta helpers ─────────────────────────────────────────────────────────

export interface CacheMeta {
  last_attempt?: string
  last_success?: string
}

export async function readMeta(
  anvilHome: string,
  sourceId: string,
): Promise<CacheMeta> {
  try {
    const raw = await readFile(metaPath(anvilHome, sourceId), 'utf-8')
    return JSON.parse(raw) as CacheMeta
  } catch {
    return {}
  }
}

async function writeMeta(
  anvilHome: string,
  sourceId: string,
  meta: CacheMeta,
): Promise<void> {
  await atomicWriteText(
    metaPath(anvilHome, sourceId),
    `${JSON.stringify(meta, null, 2)}\n`,
  )
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Write a catalog index atomically, then update meta with last_success.
 * Acquires the write lock for the duration of the operation.
 */
export async function writeIndexAtomic(
  anvilHome: string,
  sourceId: string,
  index: CatalogIndex,
): Promise<void> {
  await acquireLock(anvilHome)
  try {
    const target = indexPath(anvilHome, sourceId)
    await atomicWriteText(target, `${JSON.stringify(index, null, 2)}\n`)

    const meta = await readMeta(anvilHome, sourceId)
    meta.last_success = new Date().toISOString()
    meta.last_attempt = meta.last_success
    await writeMeta(anvilHome, sourceId, meta)
  } finally {
    await releaseLock(anvilHome)
  }
}

/**
 * Read a catalog index from cache. Returns null when the index does not exist.
 * Lock-free (atomic rename guarantees the file is always consistent).
 *
 * NOTE: Uses a lenient reader that reconstructs entries field-by-field rather
 * than strict Zod parsing. This is intentional — the data was written by
 * `writeIndexAtomic` which accepts already-parsed `CatalogIndex` values, and
 * those values may have been produced by `parseIndex` (in refresh.ts) which is
 * also lenient (e.g., allows http:// fetch_url in testing environments).
 * Strict Zod parse of the stored JSON would reject any entry that was accepted
 * by the lenient writer. A follow-up ticket (strict Zod parseIndex) will harden
 * this. See plan §8 P5 note.
 */
export async function readIndex(
  anvilHome: string,
  sourceId: string,
): Promise<CatalogIndex | null> {
  try {
    const raw = await readFile(indexPath(anvilHome, sourceId), 'utf-8')
    const obj = JSON.parse(raw) as unknown

    if (typeof obj !== 'object' || obj === null || Array.isArray(obj))
      return null
    const rec = obj as Record<string, unknown>

    if (
      typeof rec.source_id !== 'string' ||
      typeof rec.schema_version !== 'string' ||
      typeof rec.fetched_at !== 'string' ||
      !Array.isArray(rec.entries)
    )
      return null

    const entries: CatalogIndex['entries'] = []
    for (const e of rec.entries as unknown[]) {
      if (typeof e !== 'object' || e === null) continue
      const entry = e as Record<string, unknown>
      if (
        typeof entry.slug !== 'string' ||
        typeof entry.display_name !== 'string' ||
        typeof entry.description !== 'string' ||
        typeof entry.upstream_repo !== 'string' ||
        typeof entry.upstream_path !== 'string' ||
        typeof entry.upstream_ref !== 'string' ||
        typeof entry.fetch_url !== 'string' ||
        typeof entry.fetch_kind !== 'string'
      )
        continue
      entries.push({
        slug: entry.slug,
        display_name: entry.display_name,
        description: entry.description,
        upstream_repo: entry.upstream_repo,
        upstream_path: entry.upstream_path,
        upstream_ref: entry.upstream_ref,
        fetch_url: entry.fetch_url,
        fetch_kind: entry.fetch_kind as 'tarball' | 'zip' | 'tree-listing',
        declared_license:
          typeof entry.declared_license === 'string'
            ? entry.declared_license
            : undefined,
        declared_kind:
          typeof entry.declared_kind === 'string'
            ? (entry.declared_kind as 'extension' | 'preset' | 'profile')
            : undefined,
        size_hint_bytes:
          typeof entry.size_hint_bytes === 'number'
            ? entry.size_hint_bytes
            : undefined,
      })
    }

    return {
      source_id: rec.source_id,
      schema_version: rec.schema_version,
      fetched_at: rec.fetched_at,
      entries,
    }
  } catch {
    return null
  }
}

/**
 * Write a blob atomically to the content-addressed store.
 * Acquires the write lock for the duration of the operation.
 */
export async function writeBlob(
  anvilHome: string,
  sha256: string,
  bytes: Uint8Array,
): Promise<void> {
  await acquireLock(anvilHome)
  try {
    await atomicWriteBytes(blobPath(anvilHome, sha256), bytes)
  } finally {
    await releaseLock(anvilHome)
  }
}

/**
 * Read a blob from the content-addressed store. Returns null when absent.
 * Lock-free.
 */
export async function readBlob(
  anvilHome: string,
  sha256: string,
): Promise<Uint8Array | null> {
  try {
    const buf = await readFile(blobPath(anvilHome, sha256))
    return new Uint8Array(buf)
  } catch {
    return null
  }
}

/**
 * Record a fetch attempt in the source's meta file.
 * Updates last_attempt always; updates last_success only on success.
 * Acquires the write lock.
 */
export async function recordFetchAttempt(
  anvilHome: string,
  sourceId: string,
  success: boolean,
): Promise<void> {
  await acquireLock(anvilHome)
  try {
    const meta = await readMeta(anvilHome, sourceId)
    const now = new Date().toISOString()
    meta.last_attempt = now
    if (success) {
      meta.last_success = now
    }
    await writeMeta(anvilHome, sourceId, meta)
  } finally {
    await releaseLock(anvilHome)
  }
}
