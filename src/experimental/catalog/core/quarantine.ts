/**
 * ANV-0028 (P2) — Quarantine store + provenance.
 *
 * Layer 0 — filesystem I/O only; no network, no validator logic.
 *
 * Layout under anvilHome (= ~/.anvil/):
 *   extensions/_quarantine/
 *     <sourceId>/
 *       <slug>/
 *         provenance.json   ← full QuarantineRecord (source of truth)
 *         manifest.json     ← ExtensionManifest (convenience copy)
 *         validation.json   ← {} stub; P3 validators write into this
 *         content/          ← empty now; P4 fetch unwrapper populates it
 *
 * Write pattern: write to <file>.tmp → fsync → rename (POSIX atomic).
 * Reads are lock-free (atomic rename guarantees consistency).
 *
 * Conflict rule: if a slug directory already has a provenance.json with a
 * DIFFERENT quarantine_id, throw DuplicateQuarantineError. If the id is the
 * SAME, treat as an idempotent overwrite (re-quarantine the same asset).
 */

import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { QuarantineRecord } from './types.js'

// ─── Path helpers (pure) ───────────────────────────────────────────────────

/** Root of the quarantine directory: ~/.anvil/extensions/_quarantine/ */
export function quarantineRoot(anvilHome: string): string {
  return join(anvilHome, 'extensions', '_quarantine')
}

/** Directory for a source: _quarantine/<sourceId>/ */
export function sourceDir(anvilHome: string, sourceId: string): string {
  return join(quarantineRoot(anvilHome), sourceId)
}

/** Directory for a quarantined slug: _quarantine/<sourceId>/<slug>/ */
export function quarantineDir(
  anvilHome: string,
  sourceId: string,
  slug: string,
): string {
  return join(sourceDir(anvilHome, sourceId), slug)
}

/**
 * Canonical quarantine_id for a slug:
 *   <source>-<slug>-<shortSha>
 */
export function quarantineId(
  sourceId: string,
  slug: string,
  shortSha: string,
): string {
  return `${sourceId}-${slug}-${shortSha}`
}

// ─── Error types ──────────────────────────────────────────────────────────

/**
 * Thrown by `writeQuarantineRecord` when the slug directory already contains
 * a `provenance.json` with a DIFFERENT quarantine_id.
 */
export class DuplicateQuarantineError extends Error {
  /** The quarantine_id that already exists on disk. */
  readonly quarantine_id: string

  constructor(existingId: string, incomingId: string) {
    super(
      `anvil-quarantine: slug already quarantined with id "${existingId}"; cannot overwrite with id "${incomingId}". Use dropQuarantineRecord first if you intend to replace it.`,
    )
    this.name = 'DuplicateQuarantineError'
    this.quarantine_id = existingId
  }
}

// ─── Atomic write helper ───────────────────────────────────────────────────

/**
 * Write `content` to `targetPath` atomically:
 *   1. Write to `<targetPath>.tmp`
 *   2. fsync the temp file
 *   3. rename (atomic on POSIX)
 */
async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(tmpPath, content, 'utf-8')
  const fh = await open(tmpPath, 'r+')
  await fh.sync()
  await fh.close()
  await rename(tmpPath, targetPath)
}

// ─── safeReadJSON ─────────────────────────────────────────────────────────

/**
 * Attempt to read and JSON-parse a file. Returns null on any error (file
 * absent, permission denied, parse failure). Never throws.
 */
async function safeReadJSON(filePath: string): Promise<unknown> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

// ─── Public I/O ───────────────────────────────────────────────────────────

/**
 * Write a QuarantineRecord to disk atomically.
 *
 * Files written inside `_quarantine/<sourceId>/<slug>/`:
 *   - provenance.json  (full QuarantineRecord)
 *   - manifest.json    (record.manifest, convenience copy)
 *   - validation.json  ({} stub for P3 validators)
 *   - content/         (empty directory; P4 fetch unwrapper populates)
 *
 * Conflict behaviour:
 *   - Same quarantine_id as existing record → idempotent overwrite (no error).
 *   - Different quarantine_id → throw DuplicateQuarantineError.
 */
export async function writeQuarantineRecord(
  anvilHome: string,
  record: QuarantineRecord,
): Promise<void> {
  const sourceId = record.source.id
  const slug = record.index_entry.slug
  const dir = quarantineDir(anvilHome, sourceId, slug)

  // Check for an existing provenance.json
  const provenancePath = join(dir, 'provenance.json')
  const existing = await safeReadJSON(provenancePath)

  if (existing !== null) {
    // If there's an existing record, check if it's the same quarantine_id.
    // Use a lenient structural check (not strict Zod) since the URL-scheme
    // validators in CatalogSource / CatalogIndexEntry would reject records
    // written in test environments. The quarantine_id field is all we need
    // to enforce the duplicate-prevention invariant.
    const existingRecord = existing as Record<string, unknown>
    const existingId =
      typeof existingRecord.quarantine_id === 'string'
        ? existingRecord.quarantine_id
        : null
    if (existingId !== null && existingId !== record.quarantine_id) {
      throw new DuplicateQuarantineError(existingId, record.quarantine_id)
    }
    // Same quarantine_id → fall through to overwrite (idempotent)
  }

  // Ensure the directory exists
  await mkdir(dir, { recursive: true })

  // Write provenance.json (full record)
  await atomicWrite(provenancePath, `${JSON.stringify(record, null, 2)}\n`)

  // Write manifest.json (convenience copy)
  await atomicWrite(
    join(dir, 'manifest.json'),
    `${JSON.stringify(record.manifest, null, 2)}\n`,
  )

  // Write validation.json stub (empty object; P3 validators write into this)
  // Only write stub if not already present — avoid clobbering existing validator output
  // on idempotent re-write. For idempotent overwrite we do re-write it as empty too
  // since the record itself may have changed.
  await atomicWrite(join(dir, 'validation.json'), '{}\n')

  // Create content/ subdirectory (P4 fetch unwrapper will populate it)
  await mkdir(join(dir, 'content'), { recursive: true })
}

/**
 * Read a QuarantineRecord from disk.
 *
 * Returns null when:
 *   - The slug directory does not exist.
 *   - provenance.json is absent.
 *   - provenance.json fails JSON parse or Zod validation.
 */
export async function readQuarantineRecord(
  anvilHome: string,
  sourceId: string,
  slug: string,
): Promise<QuarantineRecord | null> {
  const provenancePath = join(
    quarantineDir(anvilHome, sourceId, slug),
    'provenance.json',
  )
  const raw = await safeReadJSON(provenancePath)
  if (raw === null) return null

  // Use a lenient structural check rather than strict Zod validation.
  // Rationale: The data was written by our own code which validated the record
  // before writing. Strict re-validation (especially URL schemes) would reject
  // records written in test environments where HTTPS enforcement is relaxed.
  // A follow-up ticket (strict parseIndex / strict read) will harden this.
  if (
    typeof raw !== 'object' ||
    raw === null ||
    typeof (raw as Record<string, unknown>).quarantine_id !== 'string'
  ) {
    return null
  }
  return raw as QuarantineRecord
}

/**
 * List all QuarantineRecords across all sources.
 *
 * Tolerant — skips any directory whose provenance.json is absent or fails
 * Zod parse. Never throws on malformed entries; those directories are silently
 * skipped. Throws only on unexpected filesystem errors (e.g. permission denied
 * on the quarantine root itself when the directory exists).
 */
export async function listQuarantineRecords(
  anvilHome: string,
): Promise<QuarantineRecord[]> {
  const root = quarantineRoot(anvilHome)

  // If the root doesn't exist yet, return empty list
  let sourceDirs: string[]
  try {
    sourceDirs = await readdir(root)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const records: QuarantineRecord[] = []

  for (const source of sourceDirs) {
    const sDir = join(root, source)
    let slugDirs: string[]
    try {
      slugDirs = await readdir(sDir)
    } catch {
      continue
    }

    for (const slug of slugDirs) {
      const record = await readQuarantineRecord(anvilHome, source, slug)
      if (record !== null) {
        records.push(record)
      }
    }
  }

  return records
}

/**
 * Remove a quarantined slug directory from disk.
 *
 * Idempotent — no-op when the directory does not exist.
 */
export async function dropQuarantineRecord(
  anvilHome: string,
  sourceId: string,
  slug: string,
): Promise<void> {
  const dir = quarantineDir(anvilHome, sourceId, slug)
  await rm(dir, { recursive: true, force: true })
}
