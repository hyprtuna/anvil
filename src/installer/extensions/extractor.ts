/**
 * ANV-0027 — Path-traversal-safe archive extractor.
 *
 * Accepts a `.tar.gz` / `.tgz` / `.zip` archive and a target directory.
 * Pre-scans the archive listing, rejects:
 *   - any entry whose resolved path escapes the target dir
 *   - any absolute-path entry
 *   - any symlink entry
 *   - archives exceeding the entry or byte caps (DoS guards)
 * Only extracts after the listing passes validation. Post-extraction, every
 * written file is `fs.realpath`-checked to catch symlinks created during
 * extraction.
 *
 * Returns `{ ok: true, value: { files } }` or `{ ok: false, error }`.
 * Never throws.
 *
 * Implementation note: we shell out to `tar` and `unzip` rather than pulling
 * a Node parser dependency. Both are universally available on Anvil's
 * supported platforms. The listing is parsed for safety *before* any
 * extraction occurs.
 */

import { spawn } from 'node:child_process'
import type { Dirent } from 'node:fs'
import { access, mkdir, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, normalize, resolve, sep } from 'node:path'
import { EXTRACT_MAX_BYTES, EXTRACT_MAX_ENTRIES } from './types.js'
import type { ExtractError, Result } from './types.js'

interface EntryInfo {
  archivePath: string
  type: 'file' | 'dir' | 'symlink' | 'other'
  size: number
}

interface ProcResult {
  code: number | null
  stdout: string
  stderr: string
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string } = {},
): Promise<ProcResult> {
  return new Promise((resolveP) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (b) => out.push(b as Buffer))
    child.stderr.on('data', (b) => err.push(b as Buffer))
    child.on('error', (e) => {
      resolveP({
        code: -1,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: `${Buffer.concat(err).toString('utf8')}${e.message}`,
      })
    })
    child.on('close', (code) => {
      resolveP({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      })
    })
  })
}

function archiveFormat(archivePath: string): 'tar.gz' | 'zip' | 'unsupported' {
  const lower = archivePath.toLowerCase()
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz'
  if (lower.endsWith('.zip')) return 'zip'
  return 'unsupported'
}

function parseTarListing(stdout: string): EntryInfo[] {
  const entries: EntryInfo[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) continue
    const match = line.match(
      /^([\-dlcbps])[rwxsStTlL\-]{9}\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.*)$/,
    )
    if (!match) continue
    const typeChar = match[1]
    const size = Number.parseInt(match[2] ?? '0', 10)
    let name = match[3] ?? ''
    if (typeChar === 'l') {
      const arrow = name.indexOf(' -> ')
      if (arrow >= 0) name = name.slice(0, arrow)
    }
    let type: EntryInfo['type'] = 'other'
    if (typeChar === '-') type = 'file'
    else if (typeChar === 'd') type = 'dir'
    else if (typeChar === 'l') type = 'symlink'
    entries.push({ archivePath: name, type, size })
  }
  return entries
}

function parseZipListing(stdout: string): EntryInfo[] {
  const entries: EntryInfo[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trimEnd()
    if (!line) continue
    if (
      line.startsWith('Archive:') ||
      line.startsWith('Zip file size:') ||
      /^\d+\s+files?,?\s/.test(line) ||
      line.startsWith('Empty zipfile')
    ) {
      continue
    }
    // Python's zipfile.writestr() leaves external_attr at 0, so unzip
    // reports the type char as `?`. Treat unknown type as a regular file.
    const m = line.match(
      /^([\-dl?])[rwxs?\-]{9}\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(.*)$/,
    )
    if (!m) continue
    const typeChar = m[1]
    const size = Number.parseInt(m[2] ?? '0', 10)
    const name = m[3] ?? ''
    let type: EntryInfo['type'] = 'other'
    if (typeChar === '-' || typeChar === '?') type = 'file'
    else if (typeChar === 'd') type = 'dir'
    else if (typeChar === 'l') type = 'symlink'
    entries.push({ archivePath: name, type, size })
  }
  return entries
}

function isPathInside(target: string, archivePath: string): boolean {
  if (!archivePath) return false
  if (isAbsolute(archivePath)) return false
  const normalised = normalize(archivePath)
  if (normalised.startsWith(`..${sep}`) || normalised === '..') return false
  const joined = resolve(target, normalised)
  const targetWithSep = target.endsWith(sep) ? target : `${target}${sep}`
  return joined === target || joined.startsWith(targetWithSep)
}

function err(
  code: ExtractError['code'],
  message: string,
  detail?: string,
): Result<never, ExtractError> {
  return { ok: false, error: { code, message, detail } }
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = (await readdir(dir, {
        withFileTypes: true,
      })) as unknown as Dirent[]
    } catch {
      return
    }
    for (const e of entries) {
      const full = resolve(dir, String(e.name))
      if (e.isDirectory()) {
        await walk(full)
      } else {
        out.push(full)
      }
    }
  }
  await walk(root)
  return out
}

export async function safeExtract(
  archive: string,
  target: string,
): Promise<Result<{ files: string[] }, ExtractError>> {
  try {
    await access(archive)
  } catch {
    return err('ARCHIVE_NOT_FOUND', `archive does not exist: ${archive}`)
  }

  const format = archiveFormat(archive)
  if (format === 'unsupported') {
    return err(
      'UNSUPPORTED_ARCHIVE',
      `unsupported archive format (expected .tar.gz, .tgz, or .zip): ${archive}`,
    )
  }

  try {
    await mkdir(target, { recursive: true })
  } catch (e) {
    return err(
      'TARGET_INVALID',
      `target directory could not be created: ${target}`,
      e instanceof Error ? e.message : String(e),
    )
  }

  let resolvedTarget: string
  try {
    resolvedTarget = await realpath(target)
  } catch (e) {
    return err(
      'TARGET_INVALID',
      `target directory could not be resolved: ${target}`,
      e instanceof Error ? e.message : String(e),
    )
  }

  let entries: EntryInfo[]
  if (format === 'tar.gz') {
    const list = await runProcess('tar', ['-tzvf', archive])
    if (list.code !== 0) {
      return err(
        'EXTRACT_FAILED',
        'failed to list archive entries',
        list.stderr.trim() || `tar exited with code ${list.code}`,
      )
    }
    entries = parseTarListing(list.stdout)
  } else {
    const list = await runProcess('unzip', ['-Z', archive])
    if (list.code !== 0) {
      return err(
        'EXTRACT_FAILED',
        'failed to list archive entries',
        list.stderr.trim() || `unzip exited with code ${list.code}`,
      )
    }
    entries = parseZipListing(list.stdout)
  }

  if (entries.length > EXTRACT_MAX_ENTRIES) {
    return err(
      'ENTRY_CAP_EXCEEDED',
      `archive has ${entries.length} entries; cap is ${EXTRACT_MAX_ENTRIES}`,
    )
  }

  let totalBytes = 0
  for (const entry of entries) {
    if (entry.type === 'symlink') {
      return err(
        'SYMLINK_REJECTED',
        `archive contains a symlink entry, which is not allowed: ${entry.archivePath}`,
      )
    }
    if (entry.type === 'other') {
      return err(
        'EXTRACT_FAILED',
        `archive contains an unsupported entry type: ${entry.archivePath}`,
      )
    }
    if (!isPathInside(resolvedTarget, entry.archivePath)) {
      return err(
        'PATH_TRAVERSAL',
        `archive entry escapes target directory: ${entry.archivePath}`,
      )
    }
    totalBytes += entry.size
    if (totalBytes > EXTRACT_MAX_BYTES) {
      return err(
        'SIZE_CAP_EXCEEDED',
        `archive uncompressed size exceeds cap of ${EXTRACT_MAX_BYTES} bytes`,
      )
    }
  }

  if (format === 'tar.gz') {
    const ex = await runProcess('tar', [
      '-xzf',
      archive,
      '-C',
      resolvedTarget,
      '--no-same-owner',
    ])
    if (ex.code !== 0) {
      return err(
        'EXTRACT_FAILED',
        'tar extraction failed',
        ex.stderr.trim() || `tar exited with code ${ex.code}`,
      )
    }
  } else {
    const ex = await runProcess('unzip', [
      '-qq',
      '-o',
      archive,
      '-d',
      resolvedTarget,
    ])
    if (ex.code !== 0) {
      return err(
        'EXTRACT_FAILED',
        'unzip extraction failed',
        ex.stderr.trim() || `unzip exited with code ${ex.code}`,
      )
    }
  }

  const written = await listFilesRecursive(resolvedTarget)
  for (const filePath of written) {
    let real: string
    try {
      real = await realpath(filePath)
    } catch {
      return err(
        'PATH_TRAVERSAL',
        `extracted entry could not be canonicalised: ${filePath}`,
      )
    }
    const targetPrefix = resolvedTarget.endsWith(sep)
      ? resolvedTarget
      : `${resolvedTarget}${sep}`
    if (real !== resolvedTarget && !real.startsWith(targetPrefix)) {
      return err(
        'PATH_TRAVERSAL',
        `extracted entry resolves outside target: ${filePath} -> ${real}`,
      )
    }
    try {
      const st = await stat(filePath)
      if (!st.isFile() && !st.isDirectory()) {
        return err(
          'SYMLINK_REJECTED',
          `extracted entry is not a regular file or directory: ${filePath}`,
        )
      }
    } catch {
      return err(
        'EXTRACT_FAILED',
        `extracted entry could not be stat'd: ${filePath}`,
      )
    }
  }

  return { ok: true, value: { files: written } }
}

// Internal helpers exposed for unit tests.
export const __testing = {
  parseTarListing,
  parseZipListing,
  isPathInside,
  archiveFormat,
}
