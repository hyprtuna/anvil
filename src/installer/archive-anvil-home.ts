/**
 * v0.10.9 S-012 — `anvil uninstall --archive` helper.
 *
 * Archives `~/.anvil/` (excluding `cache/`) into `~/.anvil-backups/<ts>.tgz`
 * before destructive removal. Retains the most recent 5 archives and prunes
 * older ones.
 *
 * No new npm dependency: shells out to system `tar` via `child_process`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export interface ArchiveAnvilHomeOptions {
  /** Path to the `.anvil` home dir to archive. */
  anvilHome: string
  /** Destination directory for the `.tgz` files. */
  backupsDir: string
  /** When true, compute the archive path but do not write or prune. */
  dryRun: boolean
}

export interface ArchiveAnvilHomeResult {
  archivePath: string
  /** True when an archive was actually written to disk. */
  created: boolean
  /** Absolute paths of older archives removed by retention policy. */
  pruned: string[]
}

/** Maximum archives to retain in backupsDir. */
export const ARCHIVE_RETENTION = 5

/**
 * Compute a filesystem-safe ISO-like timestamp.
 * Replaces `:` with `-` for cross-FS compatibility.
 */
function isoTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/:/g, '-')
}

/**
 * List `.tgz` archive paths in `backupsDir`, sorted newest-first by mtime.
 */
function listArchives(backupsDir: string): string[] {
  if (!existsSync(backupsDir)) return []
  const entries = readdirSync(backupsDir).filter((f) => f.endsWith('.tgz'))
  const withStat = entries.map((f) => {
    const full = join(backupsDir, f)
    return { full, mtime: statSync(full).mtimeMs }
  })
  withStat.sort((a, b) => b.mtime - a.mtime)
  return withStat.map((e) => e.full)
}

/**
 * Archive `~/.anvil/` (minus `cache/`) to `~/.anvil-backups/<ts>.tgz`.
 *
 * Returns the resolved archive path, whether it was created, and any
 * older archives pruned by the retention policy.
 */
export async function archiveAnvilHome(
  opts: ArchiveAnvilHomeOptions,
): Promise<ArchiveAnvilHomeResult> {
  const { anvilHome, backupsDir, dryRun } = opts
  const ts = isoTimestamp()
  const archivePath = join(backupsDir, `${ts}.tgz`)

  if (dryRun) {
    process.stdout.write(
      `would archive ${anvilHome} to ${archivePath} (excluding cache/)\n`,
    )
    return { archivePath, created: false, pruned: [] }
  }

  if (!existsSync(anvilHome)) {
    return { archivePath, created: false, pruned: [] }
  }

  mkdirSync(backupsDir, { recursive: true })

  const result = spawnSync(
    'tar',
    [
      'czf',
      archivePath,
      '-C',
      dirname(anvilHome),
      '--exclude=cache',
      basename(anvilHome),
    ],
    { encoding: 'utf-8' },
  )
  if (result.status !== 0) {
    const stderr = result.stderr ?? '(no stderr captured)'
    throw new Error(`tar failed (exit ${result.status}): ${stderr.trim()}`)
  }

  // Retention: keep newest ARCHIVE_RETENTION, prune older.
  const all = listArchives(backupsDir)
  const toPrune = all.slice(ARCHIVE_RETENTION)
  for (const p of toPrune) {
    await rm(p, { force: true })
  }

  return { archivePath, created: true, pruned: toPrune }
}
