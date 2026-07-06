/**
 * ANV-0203 (P2) — Install pipeline (non-interactive).
 *
 * Shared writer consumed by:
 *   - CLI: `anvil extension install` (P3, layer 4)
 *   - ANV-0028 quarantine promotion (calls installFromDirectory)
 *
 * Layer 7 — installer leaf.
 * Imports from: node:fs/promises, node:path, node:crypto (sibling modules
 * + core/worktree/types for Slug validation).
 *
 * Design: plan §8 P2, coordination contract §11.
 *
 * Atomic move strategy:
 *   - For archives: safeExtract → tmp staging dir → rename into extensionDir.
 *   - For directories: cp source tree into tmp staging dir → rename into extensionDir.
 *   - Registry upserted AFTER filesystem commit so registry is never ahead of disk.
 *
 * Bundled slug set: currently empty (TODO: ANV-0028 will supply the bundled
 * inventory when it lands. The CollisionContext.bundled is populated with
 * empty sets until that hook-in exists. All Tier-2 bundled-shadow collisions
 * are therefore not detectable until ANV-0028 wires in the bundled catalog.
 * See §11 of the plan for the coordination contract.)
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Slug } from '../../core/worktree/types.js'
import { detectCollisions } from './collisions.js'
import { safeExtract } from './extractor.js'
import { parseManifest } from './manifest.js'
import { extensionDir, tmpDir, tmpInstallDir } from './paths.js'
import type { InstallRecord } from './registry-types.js'
import { loadRegistry, removeExtension, upsertExtension } from './registry.js'
import type { Collision, CollisionContext, ExtensionManifest } from './types.js'

// ─── Public types ─────────────────────────────────────────────────────────────

export type OnCollisionStrategy =
  | 'skip'
  | 'abort'
  | 'fail'
  | 'replace'
  | 'rename'

export type InstallOpts = {
  onCollision: OnCollisionStrategy
  /** Required iff onCollision === 'rename'. */
  rename?: string
}

export type CollisionFinding = Collision

export type InstallError =
  | { kind: 'INVALID_MANIFEST'; detail: string }
  | { kind: 'PATH_TRAVERSAL'; detail: string }
  | { kind: 'EXTRACTION_FAILED'; detail: string }
  | { kind: 'UNRESOLVED_COLLISION'; collisions: CollisionFinding[] }
  | { kind: 'CANNOT_REPLACE_BUNDLED'; collisions: CollisionFinding[] }
  | { kind: 'RENAME_REQUIRED'; detail: string }
  | { kind: 'REGISTRY_LOCKED'; detail: string }

export type InstallOutcome =
  | { status: 'installed' | 'replaced' | 'skipped'; record: InstallRecord }
  | { status: 'aborted'; error: InstallError }

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build an empty bundled context. ANV-0028 will populate this. */
function emptyBundled(): CollisionContext['bundled'] {
  // TODO(ANV-0028): replace with real bundled-core slug inventory once the
  // catalog discovery feature lands and exports a getBundledSlugs() helper.
  return {
    skill: new Set<string>(),
    agent: new Set<string>(),
    hook: new Set<string>(),
    command: new Set<string>(),
  }
}

/** Build a CollisionContext from the current registry + bundled inventory. */
async function buildContext(anvilHome: string): Promise<CollisionContext> {
  const registry = await loadRegistry(anvilHome)
  const installed = Object.values(registry.extensions).map((rec) => ({
    name: rec.name,
    provides: rec.manifest.provides,
  }))
  return {
    bundled: emptyBundled(),
    installed,
  }
}

/** Compute SHA-256 hex digest of a file. */
async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath)
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * Read and parse manifest.json from a directory.
 * Returns {ok: true, manifest} or {ok: false, error}.
 */
async function readManifestFromDir(
  dir: string,
): Promise<
  { ok: true; manifest: ExtensionManifest } | { ok: false; error: InstallError }
> {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      error: {
        kind: 'INVALID_MANIFEST',
        detail: `manifest.json not found in ${dir}`,
      },
    }
  }

  let raw: string
  try {
    raw = await readFile(manifestPath, 'utf-8')
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'INVALID_MANIFEST',
        detail: `cannot read manifest.json: ${(err as Error).message}`,
      },
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return {
      ok: false,
      error: {
        kind: 'INVALID_MANIFEST',
        detail: `manifest.json is not valid JSON: ${(err as Error).message}`,
      },
    }
  }

  const result = parseManifest(parsed)
  if (!result.ok) {
    return {
      ok: false,
      error: { kind: 'INVALID_MANIFEST', detail: result.error.message },
    }
  }

  return { ok: true, manifest: result.value }
}

/**
 * Validate and resolve the rename slug.
 * Returns {ok: true, slug} or {ok: false, error}.
 */
function resolveRenameName(opts: InstallOpts):
  | {
      ok: true
      slug: string
    }
  | {
      ok: false
      error: InstallError
    } {
  const newName = opts.rename
  if (!newName) {
    return {
      ok: false,
      error: {
        kind: 'RENAME_REQUIRED',
        detail:
          'onCollision is "rename" but no rename value was provided via opts.rename',
      },
    }
  }
  if (newName.startsWith('_')) {
    return {
      ok: false,
      error: {
        kind: 'RENAME_REQUIRED',
        detail: `rename slug "${newName}" is invalid — names must not start with "_" (framework-reserved prefix)`,
      },
    }
  }
  const slugResult = Slug.safeParse(newName)
  if (!slugResult.success) {
    return {
      ok: false,
      error: {
        kind: 'RENAME_REQUIRED',
        detail: `rename slug "${newName}" is not a valid slug: ${slugResult.error.issues.map((i) => i.message).join('; ')}`,
      },
    }
  }
  return { ok: true, slug: slugResult.data }
}

/**
 * Apply collision strategy. Returns either a resolved final name (and whether
 * this is a replacement) or an InstallError.
 */
async function applyCollisionStrategy(
  manifest: ExtensionManifest,
  collisions: Collision[],
  opts: InstallOpts,
  anvilHome: string,
): Promise<
  | {
      ok: true
      finalName: string
      status: 'installed' | 'replaced' | 'skipped'
    }
  | { ok: false; error: InstallError }
> {
  // rename strategy: always resolves to a new name regardless of collisions
  if (opts.onCollision === 'rename') {
    const renameResult = resolveRenameName(opts)
    if (!renameResult.ok) return { ok: false, error: renameResult.error }
    return { ok: true, finalName: renameResult.slug, status: 'installed' }
  }

  // No collisions — proceed normally
  if (collisions.length === 0) {
    return { ok: true, finalName: manifest.name, status: 'installed' }
  }

  // Has collisions — apply strategy
  switch (opts.onCollision) {
    case 'skip':
      return { ok: true, finalName: manifest.name, status: 'skipped' }

    case 'abort':
    case 'fail':
      return {
        ok: false,
        error: { kind: 'UNRESOLVED_COLLISION', collisions },
      }

    case 'replace': {
      // Check all collisions are Tier 1 (installed-extension shadow only)
      const nonTier1 = collisions.filter((c) => c.tier !== 1)
      if (nonTier1.length > 0) {
        return {
          ok: false,
          error: {
            kind: 'CANNOT_REPLACE_BUNDLED',
            collisions: nonTier1,
          },
        }
      }
      // Remove each colliding installed extension from registry (disk removal
      // is handled by the commit step; registry entry is dropped here).
      for (const collision of collisions) {
        if (collision.tier === 1 && collision.kind === 'extension') {
          await removeExtension(anvilHome, collision.slug)
          // Also remove the extension directory
          const collisionDir = extensionDir(anvilHome, collision.slug)
          await rm(collisionDir, { recursive: true, force: true })
        }
      }
      return { ok: true, finalName: manifest.name, status: 'replaced' }
    }
  }
}

/**
 * Commit the staged directory into the final extensionDir and update the
 * registry. The staging dir is renamed atomically into the extension slot.
 */
async function commitInstall(
  stagingDir: string,
  finalName: string,
  manifest: ExtensionManifest,
  source: InstallRecord['source'],
  anvilHome: string,
): Promise<InstallRecord> {
  const destDir = extensionDir(anvilHome, finalName)

  // Write manifest.json (may differ from original if name was rewritten)
  const manifestCopy = { ...manifest, name: finalName }
  await writeFile(
    join(stagingDir, 'manifest.json'),
    `${JSON.stringify(manifestCopy, null, 2)}\n`,
    'utf-8',
  )

  // Build InstallRecord
  const record: InstallRecord = {
    schema_version: '1.0.0',
    name: finalName,
    version: manifest.version,
    installed_at: new Date().toISOString(),
    source,
    manifest: manifestCopy,
  }

  // Write .install.json into staging dir
  await writeFile(
    join(stagingDir, '.install.json'),
    `${JSON.stringify(record, null, 2)}\n`,
    'utf-8',
  )

  // Atomic rename: staging → destination
  // If destDir exists (e.g. replace path left debris), remove it first
  await rm(destDir, { recursive: true, force: true })
  await rename(stagingDir, destDir)

  // Update registry AFTER filesystem is committed
  await upsertExtension(anvilHome, record)

  return record
}

// ─── Public entry points ──────────────────────────────────────────────────────

/**
 * Install an extension from a directory containing manifest.json.
 *
 * The source directory is copied (not moved) so the caller's source remains
 * intact. The copy goes through a pid-stamped tmp staging dir and is renamed
 * atomically into the final extensionDir.
 */
export async function installFromDirectory(
  source: string,
  opts: InstallOpts,
  anvilHome: string,
): Promise<InstallOutcome> {
  // Step 1: Validate manifest
  const manifestResult = await readManifestFromDir(source)
  if (!manifestResult.ok) {
    return { status: 'aborted', error: manifestResult.error }
  }
  const manifest = manifestResult.manifest

  // Step 2: For rename strategy, validate the new name before any I/O
  // so we fail fast if the slug is invalid.
  if (opts.onCollision === 'rename') {
    const renameResult = resolveRenameName(opts)
    if (!renameResult.ok) {
      return { status: 'aborted', error: renameResult.error }
    }
  }

  // Step 3: Detect collisions
  const ctx = await buildContext(anvilHome)
  const collisions = detectCollisions(manifest, ctx)

  // Step 4: Apply strategy
  const strategyResult = await applyCollisionStrategy(
    manifest,
    collisions,
    opts,
    anvilHome,
  )
  if (!strategyResult.ok) {
    return { status: 'aborted', error: strategyResult.error }
  }

  const { finalName, status } = strategyResult

  // Step 5: Short-circuit for 'skipped' — no writes
  if (status === 'skipped') {
    // Return a synthesized record (not written to disk)
    const record: InstallRecord = {
      schema_version: '1.0.0',
      name: finalName,
      version: manifest.version,
      installed_at: new Date().toISOString(),
      source: { kind: 'directory', path: source },
      manifest,
    }
    return { status: 'skipped', record }
  }

  // Step 6: Commit via staging dir
  const stagingDir = tmpInstallDir(anvilHome)
  try {
    await mkdir(tmpDir(anvilHome), { recursive: true })
    // Copy source tree into staging dir
    await cp(source, stagingDir, { recursive: true })

    const installSource: InstallRecord['source'] = {
      kind: 'directory',
      path: source,
    }

    const record = await commitInstall(
      stagingDir,
      finalName,
      manifest,
      installSource,
      anvilHome,
    )

    return { status: status as 'installed' | 'replaced', record }
  } catch (err) {
    // Clean up staging dir on error
    await rm(stagingDir, { recursive: true, force: true })
    return {
      status: 'aborted',
      error: {
        kind: 'EXTRACTION_FAILED',
        detail: `commit failed: ${(err as Error).message}`,
      },
    }
  }
  // Note: staging dir is renamed (not deleted) on success — rename moves it
  // to extensionDir, so nothing to clean up on success.
}

/**
 * Install an extension from a .tar.gz / .tgz / .zip archive.
 *
 * The archive is extracted to a pid-stamped tmp staging dir, the manifest is
 * read from there, and the staging dir is renamed atomically into extensionDir.
 */
export async function installFromArchive(
  source: string,
  opts: InstallOpts,
  anvilHome: string,
): Promise<InstallOutcome> {
  const stagingDir = tmpInstallDir(anvilHome)

  try {
    await mkdir(tmpDir(anvilHome), { recursive: true })

    // Step 1: Extract archive to staging dir
    const extractResult = await safeExtract(source, stagingDir)
    if (!extractResult.ok) {
      const errCode = extractResult.error.code
      const detail = extractResult.error.message
      if (errCode === 'PATH_TRAVERSAL') {
        return {
          status: 'aborted',
          error: { kind: 'PATH_TRAVERSAL', detail },
        }
      }
      return {
        status: 'aborted',
        error: { kind: 'EXTRACTION_FAILED', detail },
      }
    }

    // Step 2: Validate manifest from extracted staging dir
    const manifestResult = await readManifestFromDir(stagingDir)
    if (!manifestResult.ok) {
      return { status: 'aborted', error: manifestResult.error }
    }
    const manifest = manifestResult.manifest

    // Step 3: Validate rename slug early (before more I/O)
    if (opts.onCollision === 'rename') {
      const renameResult = resolveRenameName(opts)
      if (!renameResult.ok) {
        return { status: 'aborted', error: renameResult.error }
      }
    }

    // Step 4: Detect collisions
    const ctx = await buildContext(anvilHome)
    const collisions = detectCollisions(manifest, ctx)

    // Step 5: Apply strategy
    const strategyResult = await applyCollisionStrategy(
      manifest,
      collisions,
      opts,
      anvilHome,
    )
    if (!strategyResult.ok) {
      return { status: 'aborted', error: strategyResult.error }
    }

    const { finalName, status } = strategyResult

    // Short-circuit for skipped — no writes
    if (status === 'skipped') {
      const record: InstallRecord = {
        schema_version: '1.0.0',
        name: finalName,
        version: manifest.version,
        installed_at: new Date().toISOString(),
        source: {
          kind: 'archive',
          path: source,
          sha256: await sha256File(source),
        },
        manifest,
      }
      return { status: 'skipped', record }
    }

    // Step 6: Commit — rename staging dir to extensionDir
    const installSource: InstallRecord['source'] = {
      kind: 'archive',
      path: source,
      sha256: await sha256File(source),
    }

    const record = await commitInstall(
      stagingDir,
      finalName,
      manifest,
      installSource,
      anvilHome,
    )

    return { status: status as 'installed' | 'replaced', record }
  } finally {
    // Always clean up staging dir — if rename succeeded, rm is a no-op
    // (the dir no longer exists); if something failed, this cleans debris.
    await rm(stagingDir, { recursive: true, force: true })
  }
}
