/**
 * Symlink-safe predictable-path IO (ANV-0041).
 *
 * Anvil writes predictable paths under `~/.anvil/` and `.anvil/` (notepads,
 * registry, session state, hook telemetry). Without symlink-refusal a local
 * attacker who can plant files in those directories can replace one of the
 * predictable paths with a symlink to e.g. `~/.ssh/id_rsa` and force Anvil to
 * clobber it on the next write. This module is the single trusted writer for
 * those paths.
 *
 * Design (mirrors the caveman primitive — see references/caveman/):
 *  - Open with `O_NOFOLLOW` so the kernel refuses if the final component is a
 *    symlink. This is the actual clobber vector — if the *file* is a symlink,
 *    the open syscall itself fails (ELOOP).
 *  - When the *parent directory* is a symlink (legitimate pattern: a shared
 *    config drive) we resolve through `realpathSync` and verify the resolved
 *    directory is owned by the current uid. This allows e.g.
 *    `ln -s /opt/shared ~/.anvil` while still refusing attacker-planted dirs.
 *  - Atomic temp + rename. The temp path includes pid + a random suffix so
 *    concurrent writers from different sessions can't collide.
 *  - 64 KB default cap, configurable per call. Predictable state files are
 *    small JSON / markdown — anything larger is a bug or an exfil attempt.
 *  - Never leaks the fd: open / close are paired in a try/finally.
 *  - Throws typed errors callers can catch and decide whether to silent-fail
 *    (best-effort telemetry) or surface (notepad write the user requested).
 *
 * Layer-0: this file imports nothing from higher layers.
 *
 * Out of scope (deferred):
 *  - Cross-platform Windows hardening — uid checks are skipped there. Symlinks
 *    on NTFS require admin to plant, so the attack surface is much smaller.
 *  - Symlink-safe reads inside the skill loader (skills are user-controlled
 *    content; lower risk).
 */

import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** Default size cap for safe writes (64 KB). */
export const DEFAULT_MAX_BYTES = 64 * 1024

/**
 * Thrown when a write/read target is a symlink, or when its parent directory
 * resolves to a path not owned by the current uid.
 */
export class SymlinkRefusalError extends Error {
  readonly path: string
  readonly reason: string
  constructor(path: string, reason: string) {
    super(`safe-io: refused ${path}: ${reason}`)
    this.name = 'SymlinkRefusalError'
    this.path = path
    this.reason = reason
  }
}

/**
 * Thrown when the resolved directory is owned by a different uid than the
 * current process. Distinct from SymlinkRefusalError so callers can tell
 * "attacker-planted symlink" apart from "legitimate-but-foreign-uid mount".
 */
export class OwnershipMismatchError extends Error {
  readonly path: string
  readonly expectedUid: number
  readonly actualUid: number
  constructor(path: string, expectedUid: number, actualUid: number) {
    super(`safe-io: ${path} owned by uid ${actualUid}, expected ${expectedUid}`)
    this.name = 'OwnershipMismatchError'
    this.path = path
    this.expectedUid = expectedUid
    this.actualUid = actualUid
  }
}

export interface SafeIoOptions {
  /** Maximum bytes to read or write. Defaults to 64 KB. */
  maxBytes?: number
  /** File mode for newly created files. Defaults to 0o600. */
  mode?: number
}

/**
 * Resolve the parent directory and verify ownership when it's a symlink.
 *
 * Returns the (real) directory path to use for the temp/final write. Throws
 * SymlinkRefusalError or OwnershipMismatchError on anomaly.
 */
function resolveSafeDir(filePath: string): string {
  const parentDir = dirname(filePath)
  // Create the parent eagerly. mkdir is idempotent and the only call-site
  // currently does it manually anyway.
  mkdirSync(parentDir, { recursive: true })

  let lst: ReturnType<typeof lstatSync>
  try {
    lst = lstatSync(parentDir)
  } catch (e) {
    throw new SymlinkRefusalError(
      parentDir,
      `lstat failed: ${(e as Error).message}`,
    )
  }

  if (!lst.isSymbolicLink()) {
    return parentDir
  }

  // Parent is a symlink. Resolve it and verify the target is a real dir owned
  // by the current uid.
  const realDir = realpathSync(parentDir)
  const realStat = statSync(realDir)
  if (!realStat.isDirectory()) {
    throw new SymlinkRefusalError(
      parentDir,
      `symlink target ${realDir} is not a directory`,
    )
  }
  const uid =
    typeof process.getuid === 'function' ? process.getuid() : undefined
  if (uid !== undefined && realStat.uid !== uid) {
    throw new OwnershipMismatchError(realDir, uid, realStat.uid)
  }
  return realDir
}

/**
 * Verify the final-component (the file itself) is not a symlink. Returns
 * silently if it doesn't exist yet (the common case for first write).
 */
function refuseFileSymlink(realPath: string): void {
  try {
    const st = lstatSync(realPath)
    if (st.isSymbolicLink()) {
      throw new SymlinkRefusalError(
        realPath,
        'target is a symlink (clobber vector)',
      )
    }
  } catch (e) {
    if (e instanceof SymlinkRefusalError) throw e
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return
    throw new SymlinkRefusalError(
      realPath,
      `lstat failed: ${(e as Error).message}`,
    )
  }
}

/** O_NOFOLLOW where supported, otherwise 0 (Windows). */
function nofollowFlag(): number {
  return typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
}

/**
 * Verify the file descriptor we just opened still resolves to a path owned by
 * the current uid. Catches a TOCTOU window where the symlink check passed but
 * an attacker swapped the file between lstat and open.
 *
 * Skipped on Windows (process.getuid is undefined).
 */
function verifyFdOwnership(fd: number, realPath: string): void {
  if (typeof process.getuid !== 'function') return
  const uid = process.getuid()
  const st = fstatSync(fd)
  if (st.uid !== uid) {
    throw new OwnershipMismatchError(realPath, uid, st.uid)
  }
}

/**
 * Generate a short random suffix to append to temp paths. Avoids collisions
 * when multiple processes with the same pid (containers) write concurrently.
 */
function tempSuffix(): string {
  return `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Atomic, symlink-safe write of a string or Buffer to a predictable path.
 *
 * Steps:
 *  1. Resolve parent directory; verify ownership if it's a symlink.
 *  2. Refuse if the target file itself is already a symlink.
 *  3. Open a sibling temp file with O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW (mode 0600).
 *  4. Write the payload, fstat the fd to confirm ownership.
 *  5. close → rename → done. Rename is atomic on the same filesystem.
 *
 * Throws on cap overflow, symlink refusal, ownership mismatch, or write error.
 * Callers that want best-effort behavior should catch and silent-fail.
 */
export function safeWrite(
  filePath: string,
  content: string | Buffer,
  opts: SafeIoOptions = {},
): void {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const mode = opts.mode ?? 0o600
  const buf =
    typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
  if (buf.byteLength > maxBytes) {
    throw new RangeError(
      `safe-io: payload (${buf.byteLength} bytes) exceeds cap (${maxBytes} bytes)`,
    )
  }

  const realDir = resolveSafeDir(filePath)
  const finalPath = join(realDir, basename(filePath))
  refuseFileSymlink(finalPath)

  const tempPath = join(realDir, `.${basename(filePath)}.tmp.${tempSuffix()}`)
  const flags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | nofollowFlag()

  let fd: number | undefined
  try {
    fd = openSync(tempPath, flags, mode)
    verifyFdOwnership(fd, tempPath)
    let written = 0
    while (written < buf.byteLength) {
      written += writeSync(fd, buf, written, buf.byteLength - written)
    }
  } catch (e) {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* swallow */
      }
      fd = undefined
    }
    try {
      unlinkSync(tempPath)
    } catch {
      /* best-effort cleanup */
    }
    throw e
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* swallow */
      }
    }
  }

  try {
    renameSync(tempPath, finalPath)
  } catch (e) {
    try {
      unlinkSync(tempPath)
    } catch {
      /* best-effort cleanup */
    }
    throw e
  }
}

/**
 * Symlink-safe append. Used for append-only telemetry logs (jsonl). Not
 * atomic (rename would lose existing content); concurrent writers rely on
 * O_APPEND for record-level interleaving.
 */
export function safeAppend(
  filePath: string,
  line: string,
  opts: SafeIoOptions = {},
): void {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const mode = opts.mode ?? 0o600
  const buf = Buffer.from(line, 'utf-8')
  if (buf.byteLength > maxBytes) {
    throw new RangeError(
      `safe-io: append payload (${buf.byteLength} bytes) exceeds cap (${maxBytes} bytes)`,
    )
  }

  const realDir = resolveSafeDir(filePath)
  const finalPath = join(realDir, basename(filePath))
  refuseFileSymlink(finalPath)

  const flags =
    constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | nofollowFlag()

  let fd: number | undefined
  try {
    fd = openSync(finalPath, flags, mode)
    verifyFdOwnership(fd, finalPath)
    let written = 0
    while (written < buf.byteLength) {
      written += writeSync(fd, buf, written, buf.byteLength - written)
    }
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * Symlink-safe read with size cap. Returns the content as a UTF-8 string.
 *
 * The skill loader is intentionally NOT migrated to this — skills are
 * user-controlled content with their own conventions. This is for predictable
 * state files (jsonl logs, registry, active-routing).
 *
 * Throws SymlinkRefusalError if the file is a symlink. Throws RangeError if
 * the file size exceeds the cap (callers should catch and decide whether to
 * truncate or refuse).
 */
export function safeRead(filePath: string, opts: SafeIoOptions = {}): string {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES
  const st = lstatSync(filePath)
  if (st.isSymbolicLink()) {
    throw new SymlinkRefusalError(filePath, 'read target is a symlink')
  }
  if (!st.isFile()) {
    throw new SymlinkRefusalError(filePath, 'read target is not a regular file')
  }
  if (st.size > maxBytes) {
    throw new RangeError(
      `safe-io: read of ${filePath} (${st.size} bytes) exceeds cap (${maxBytes} bytes)`,
    )
  }

  const flags = constants.O_RDONLY | nofollowFlag()
  let fd: number | undefined
  try {
    fd = openSync(filePath, flags)
    verifyFdOwnership(fd, filePath)
    return readFileSync(fd, 'utf-8')
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd)
      } catch {
        /* swallow */
      }
    }
  }
}
