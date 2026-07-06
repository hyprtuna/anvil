/**
 * ANV-0028 (P4) — `anvil catalog fetch <source>:<slug>` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: yes. Mutates: _quarantine/ only.
 *
 * Downloads the blob for a catalog entry, writes a QuarantineRecord, and
 * records provenance. Does NOT promote.
 *
 * Exit codes:
 *   0 — success
 *   1 — invalid source:slug or unknown source/slug or entry not in index
 *   2 — network failure
 *   4 — ANVIL_OFFLINE=1
 *   5 — duplicate quarantine (incompatible quarantine_id already exists)
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { safeExtract } from '../../../installer/extensions/extractor.js'
import { readIndex, writeBlob } from '../core/cache.js'
import { fetchUrl } from '../core/fetcher.js'
import {
  DuplicateQuarantineError,
  quarantineDir,
  quarantineId,
  writeQuarantineRecord,
} from '../core/quarantine.js'
import { getBuiltInSources } from '../core/sources.js'
import type {
  CatalogIndexEntry,
  CatalogSource,
  ProvenanceMetadata,
  QuarantineRecord,
} from '../core/types.js'
import {
  EXIT_DUPLICATE_QUARANTINE,
  EXIT_INVALID_INPUT,
  EXIT_NETWORK_FAILURE,
  EXIT_OFFLINE,
  EXIT_OK,
  parseSourceSlug,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface FetchOpts {
  json?: boolean
}

type FetchResult = {
  quarantine_id: string
  source_id: string
  slug: string
  blob_sha256: string
  quarantine_path: string
}

/**
 * Derive a ProvenanceMetadata from a CatalogIndexEntry and CatalogSource.
 * For v0.15.7 we synthesise the provenance from what the index provides.
 * Fields that require inspection of the repo (LICENSE file, etc.) are
 * approximated here and can be refined via a follow-up validator run.
 */
function buildProvenance(
  source: CatalogSource,
  entry: CatalogIndexEntry,
): ProvenanceMetadata {
  return {
    source_id: source.id,
    source_repo: entry.upstream_repo,
    source_path: entry.upstream_path,
    vendored_at: new Date().toISOString(),
    upstream_license: entry.declared_license ?? 'UNKNOWN',
    upstream_version_or_commit: entry.upstream_ref,
    upstream_license_source: entry.declared_license ? 'declared' : 'unknown',
  }
}

/**
 * Build a minimal ExtensionManifest from a CatalogIndexEntry.
 * The real manifest should be extracted from the blob content; for v0.15.7
 * we synthesise a minimal record that passes the schema validator so that the
 * quarantine record can be created. A follow-up step (or the promote validator)
 * will inspect the actual content/.
 */
function buildMinimalManifest(
  entry: CatalogIndexEntry,
): QuarantineRecord['manifest'] {
  return {
    schema_version: '1.0.0',
    name: entry.slug,
    version: '0.0.0',
    description: entry.description.slice(0, 200),
    kind: entry.declared_kind ?? 'extension',
    provides: {},
    requires: [],
    compatibility: { min_anvil_version: '0.1.0' },
  }
}

/**
 * Main handler for `anvil catalog fetch <source>:<slug>`.
 *
 * @param arg       The "<source>:<slug>" argument.
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function fetchCommand(
  arg: string,
  opts: FetchOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  // Honour ANVIL_OFFLINE before any I/O
  if (process.env.ANVIL_OFFLINE === '1') {
    if (opts.json) {
      writeJson({
        status: 'offline',
        message: 'ANVIL_OFFLINE=1; fetch skipped',
      })
    } else {
      process.stdout.write(
        'Offline mode active (ANVIL_OFFLINE=1); fetch skipped.\n',
      )
    }
    return EXIT_OFFLINE
  }

  const parsed = parseSourceSlug(arg)
  if (parsed === null) {
    process.stderr.write(
      `anvil catalog fetch: argument must be in <source>:<slug> format, got "${arg}"\n`,
    )
    return EXIT_INVALID_INPUT
  }

  const { sourceId, slug } = parsed

  const source = getBuiltInSources().find((s) => s.id === sourceId)
  if (!source) {
    process.stderr.write(`anvil catalog fetch: unknown source "${sourceId}"\n`)
    return EXIT_INVALID_INPUT
  }

  // Look up the entry in the cached index
  const index = await readIndex(anvilHome, sourceId)
  if (index === null) {
    process.stderr.write(
      `anvil catalog fetch: no cached index for source "${sourceId}". Run \`anvil catalog refresh\` first.\n`,
    )
    return EXIT_INVALID_INPUT
  }

  const entry = index.entries.find((e) => e.slug === slug)
  if (entry === undefined) {
    process.stderr.write(
      `anvil catalog fetch: slug "${slug}" not found in source "${sourceId}".\n`,
    )
    return EXIT_INVALID_INPUT
  }

  // Fetch the blob
  const fetchResult = await fetchUrl(entry.fetch_url)
  if (!fetchResult.ok) {
    const err = fetchResult.error
    if (err.kind === 'OFFLINE') return EXIT_OFFLINE

    const detail =
      err.kind === 'HTTP_STATUS'
        ? `HTTP ${err.status}`
        : err.kind === 'TOO_LARGE'
          ? `TOO_LARGE (${err.size} bytes)`
          : err.kind === 'NETWORK'
            ? err.detail
            : err.kind
    process.stderr.write(`anvil catalog fetch: network error: ${detail}\n`)
    return EXIT_NETWORK_FAILURE
  }

  // Compute SHA256
  const sha256 = createHash('sha256').update(fetchResult.value).digest('hex')
  const shortSha = sha256.slice(0, 8)

  // Write blob to cache
  await writeBlob(anvilHome, sha256, fetchResult.value)

  // Build quarantine record identity
  const qId = quarantineId(sourceId, slug, shortSha)
  const provenance = buildProvenance(source, entry)

  // --- Content extraction (before writing quarantine record) ---
  // We extract first so the manifest can be read from the archive's manifest.json.
  // The quarantine record is then written with the real manifest, not the synthesised one.
  const qDir = quarantineDir(anvilHome, sourceId, slug)
  const contentDir = join(qDir, 'content')
  await mkdir(contentDir, { recursive: true })

  let resolvedManifest: QuarantineRecord['manifest'] =
    buildMinimalManifest(entry)

  if (entry.fetch_kind === 'tarball' || entry.fetch_kind === 'zip') {
    // Determine archive extension for safeExtract's format detection
    const archiveExt = entry.fetch_kind === 'tarball' ? '.tar.gz' : '.zip'
    const archivePath = join(contentDir, `blob${archiveExt}`)
    await writeFile(archivePath, fetchResult.value)

    const extractResult = await safeExtract(archivePath, contentDir)
    // Clean up the archive file regardless of extract result
    await rm(archivePath, { force: true })

    if (!extractResult.ok) {
      // Log the extraction warning. The record will still be written so the
      // blob is queryable via `catalog status`. The promote validator will
      // catch missing/invalid content. Users can re-run `catalog fetch` to
      // retry after diagnosing the archive issue.
      process.stderr.write(
        `anvil catalog fetch: archive extraction warning: ${extractResult.error.code}: ${extractResult.error.message}\n` +
          `  The blob is cached at SHA256=${sha256}. Re-fetch or inspect the archive manually.\n`,
      )
    }

    // Read manifest.json from extracted tree if present; otherwise use synthesised.
    const extractedManifestPath = join(contentDir, 'manifest.json')
    try {
      const raw = await readFile(extractedManifestPath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      // Tolerate any shape here — validation pipeline will enforce strict schema
      if (typeof parsed === 'object' && parsed !== null) {
        resolvedManifest = parsed as QuarantineRecord['manifest']
      }
    } catch {
      // Absent or malformed manifest.json in archive — fall back to synthesised manifest
      // and write it into content/ so promote can call installFromDirectory.
      await writeFile(
        extractedManifestPath,
        `${JSON.stringify(resolvedManifest, null, 2)}\n`,
        'utf-8',
      )
    }
  } else {
    // fetch_kind === 'tree-listing': write raw blob as blob.bin for reference.
    // Proper tree-walk fetch (downloading individual files from the listing)
    // is a follow-up — for now we store the raw listing response.
    // TODO(follow-up): implement per-file tree-walk download for tree-listing kind.
    await writeFile(join(contentDir, 'blob.bin'), fetchResult.value)
    // Write a minimal manifest.json into content/ so promote can call installFromDirectory
    await writeFile(
      join(contentDir, 'manifest.json'),
      `${JSON.stringify(resolvedManifest, null, 2)}\n`,
      'utf-8',
    )
  }

  const record: QuarantineRecord = {
    quarantine_id: qId,
    schema_version: '1.0.0',
    created_at: new Date().toISOString(),
    source,
    index_entry: entry,
    provenance,
    manifest: resolvedManifest,
    blob_sha256: sha256,
    content_dir: 'content/',
    inventory: [],
  }

  // Write quarantine record (provenance.json, manifest.json convenience copy, validation.json stub)
  try {
    await writeQuarantineRecord(anvilHome, record)
  } catch (err) {
    if (err instanceof DuplicateQuarantineError) {
      process.stderr.write(`anvil catalog fetch: ${err.message}\n`)
      return EXIT_DUPLICATE_QUARANTINE
    }
    throw err
  }

  const qPath = qDir

  const result: FetchResult = {
    quarantine_id: qId,
    source_id: sourceId,
    slug,
    blob_sha256: sha256,
    quarantine_path: qPath,
  }

  if (opts.json) {
    writeJson(result)
  } else {
    process.stdout.write(
      `Fetched ${sourceId}:${slug}\n` +
        `  quarantine_id : ${qId}\n` +
        `  sha256        : ${sha256}\n` +
        `  quarantine    : ${qPath}\n` +
        `\nRun \`anvil catalog promote ${qId}\` to promote after review.\n`,
    )
  }

  return EXIT_OK
}
