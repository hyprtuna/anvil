/**
 * ANV-0203 (P1) — Registry read / write / upsert / remove.
 *
 * Provides the only sanctioned write path to _registry.json. All mutations
 * are serialised through an in-process async queue AND guarded by a sentinel
 * lock file so concurrent processes do not corrupt the file.
 *
 * Locking strategy
 * ─────────────────
 * We use a simple exclusive-create sentinel file (`_registry.lock`) next to
 * the registry. Each writer:
 *   1. Creates `_registry.lock` exclusively (`O_CREAT | O_EXCL`). On failure
 *      (EEXIST) it retries with exponential back-off.
 *   2. Performs the read-modify-write cycle atomically (write to temp file,
 *      fsync, rename).
 *   3. Removes the sentinel unconditionally (even on error).
 *
 * This is process-level safe on POSIX (open O_EXCL is atomic on local fs).
 * The in-process queue (`pendingWrite`) ensures that concurrent calls within
 * the same Node/Bun process are serialised without contending on the lock file.
 *
 * Layer 7 — installer leaf. Imports from: node:fs/promises, node:path, zod
 * (through registry-types), and sibling paths.ts / registry-types.ts.
 */

import { constants, existsSync } from 'node:fs'
import {
  mkdir,
  open,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { registryPath } from './paths.js'
import { EMPTY_REGISTRY, InstallRecord, Registry } from './registry-types.js'

// ─── In-process write queue ───────────────────────────────────────────────────
// Serialises all writes from within one process so we don't spin the lock file
// against ourselves.
let pendingWrite: Promise<void> = Promise.resolve()

// ─── Lock-file helpers ────────────────────────────────────────────────────────

function lockPath(anvilHome: string): string {
  return join(dirname(registryPath(anvilHome)), '_registry.lock')
}

/**
 * Acquire the lock file. Retries with exponential back-off (up to ~5 s total).
 * Throws if the lock cannot be acquired within the retry budget.
 */
async function acquireLock(anvilHome: string): Promise<void> {
  const lp = lockPath(anvilHome)
  // Ensure the parent directory exists before attempting the lock
  await mkdir(dirname(lp), { recursive: true })
  const MAX_ATTEMPTS = 20
  let delay = 25 // ms

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // O_CREAT | O_EXCL — atomic exclusive create; throws EEXIST if present
      const fh = await open(
        lp,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      )
      await fh.writeFile(String(process.pid))
      await fh.close()
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      // Lock held by another process — wait and retry
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 2, 500)
    }
  }
  throw new Error(
    `anvil-registry: could not acquire lock at ${lp} after ${MAX_ATTEMPTS} attempts. Another process may be holding it. Remove the file manually if the other process has exited.`,
  )
}

/**
 * Release the lock file. Always called in a finally block — errors are swallowed
 * so they don't mask the original error from the write operation.
 */
async function releaseLock(anvilHome: string): Promise<void> {
  try {
    await unlink(lockPath(anvilHome))
  } catch {
    // Ignore: the lock may have already been removed by a crash recovery sweep.
  }
}

// ─── Atomic write ─────────────────────────────────────────────────────────────

/**
 * Write `content` to `targetPath` atomically:
 *   1. Write to `<targetPath>.tmp.<pid>`
 *   2. fsync via a re-open (Bun/Node don't expose fd-level fsync on writeFile)
 *   3. rename (atomic on POSIX)
 */
async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const tmpPath = `${targetPath}.tmp.${process.pid}`
  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(tmpPath, content, 'utf-8')
  // fsync the temp file before rename
  const fh = await open(tmpPath, 'r+')
  await fh.sync()
  await fh.close()
  await rename(tmpPath, targetPath)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the registry from disk. Returns an empty registry when the file does
 * not exist. Throws on JSON parse or Zod validation errors.
 */
export async function loadRegistry(anvilHome: string): Promise<Registry> {
  const path = registryPath(anvilHome)
  if (!existsSync(path)) return { ...EMPTY_REGISTRY, extensions: {} }

  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch (err) {
    throw new Error(
      `anvil-registry: cannot read ${path}: ${(err as Error).message}`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `anvil-registry: malformed JSON in ${path}: ${(err as Error).message}`,
    )
  }

  const validated = Registry.safeParse(parsed)
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    throw new Error(
      `anvil-registry: ${path} failed schema validation — ${issues}`,
    )
  }

  return validated.data
}

/**
 * Persist the registry to disk. Uses atomic write (temp + rename) under the
 * process-level in-process queue (no lock file — used only by internal helpers
 * that already hold the lock).
 */
export async function saveRegistry(
  anvilHome: string,
  registry: Registry,
): Promise<void> {
  const path = registryPath(anvilHome)
  // Validate before writing
  Registry.parse(registry)
  const content = `${JSON.stringify(registry, null, 2)}\n`
  await atomicWrite(path, content)
}

/**
 * Insert or update an extension record in the registry.
 *
 * Guards:
 *   - Rejects extension names starting with `_` (framework-reserved).
 *   - Validates the record against InstallRecord schema.
 *
 * Thread/process safety: serialised through the in-process queue + lock file.
 */
export async function upsertExtension(
  anvilHome: string,
  record: InstallRecord,
): Promise<void> {
  // Guard: framework-reserved prefix
  if (record.name.startsWith('_')) {
    throw new Error(
      `anvil-registry: extension name "${record.name}" is invalid — names must not start with "_" (framework-reserved prefix)`,
    )
  }

  // Validate the record
  InstallRecord.parse(record)

  // Chain onto the in-process queue
  pendingWrite = pendingWrite.then(async () => {
    await acquireLock(anvilHome)
    try {
      const reg = await loadRegistry(anvilHome)
      reg.extensions[record.name] = record
      await saveRegistry(anvilHome, reg)
    } finally {
      await releaseLock(anvilHome)
    }
  })

  return pendingWrite
}

/**
 * Remove an extension from the registry by name. No-op when the extension is
 * not present. Does NOT remove the extension directory — that is the
 * install-pipeline's responsibility.
 *
 * Thread/process safety: serialised through the in-process queue + lock file.
 */
export async function removeExtension(
  anvilHome: string,
  name: string,
): Promise<void> {
  pendingWrite = pendingWrite.then(async () => {
    await acquireLock(anvilHome)
    try {
      const reg = await loadRegistry(anvilHome)
      if (!(name in reg.extensions)) {
        // no-op
        return
      }
      delete reg.extensions[name]
      await saveRegistry(anvilHome, reg)
    } finally {
      await releaseLock(anvilHome)
    }
  })

  return pendingWrite
}
