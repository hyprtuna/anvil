import { existsSync } from 'node:fs'
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { AdapterContext } from '../adapters/interface.js'
import { stageAnvilHome } from './stage.js'

export interface SyncOptions {
  ctx: AdapterContext
  target?: string
}

export interface SyncResult {
  anvilHome: string
  version: string
  staged: number
  /** Relative paths of every file written into anvilHome. */
  filesWritten: string[]
}

async function atomicSwap(staging: string, target: string): Promise<void> {
  const oldDir = `${target}.old-${Date.now()}`
  if (existsSync(target)) {
    // Rename existing to .old-* — let errors propagate; do NOT rm here
    await rename(target, oldDir)
  }
  try {
    await rename(staging, target)
  } catch (err) {
    // cross-device rename (EXDEV) — fall back to recursive copy
    const isExdev =
      typeof err === 'object' &&
      err !== null &&
      (err as NodeJS.ErrnoException).code === 'EXDEV'
    if (!isExdev) {
      // Non-EXDEV error: try to restore oldDir before rethrowing
      if (existsSync(oldDir)) await rename(oldDir, target).catch(() => {})
      throw err
    }
    await cp(staging, target, { recursive: true })
    // rm staging after cp — failure here is non-fatal since target is committed
    await rm(staging, { recursive: true, force: true }).catch(() => {})
    return // swap committed via cp path — skip outer cleanup
  }
  // Clean up .old backup if it exists
  if (existsSync(oldDir)) {
    await rm(oldDir, { recursive: true, force: true })
  }
}

export async function syncAnvilHome({
  ctx,
  target,
}: SyncOptions): Promise<SyncResult> {
  const anvilHome =
    target ?? join(ctx.home ?? process.env.HOME ?? tmpdir(), '.anvil')

  // Stage in same parent dir as target so rename() stays on one filesystem.
  // Avoids Node.js fs.cp() fallback which converts relative symlinks to absolute paths.
  await mkdir(dirname(anvilHome), { recursive: true })
  const stagingDir = await mkdtemp(join(dirname(anvilHome), '.anvil-stage-'))

  try {
    const staged = await stageAnvilHome(ctx)

    // Write all files to staging dir
    for (const f of staged.files) {
      const dest = join(stagingDir, f.relativePath)
      await mkdir(dirname(dest), { recursive: true })
      await writeFile(dest, f.content)
      if (f.executable) {
        await chmod(dest, 0o755)
      }
    }

    // Create symlinks in staging dir
    for (const s of staged.symlinks) {
      const linkDest = join(stagingDir, s.linkPath)
      await mkdir(dirname(linkDest), { recursive: true })
      // Only create symlink if it doesn't already exist in staging
      try {
        await symlink(s.target, linkDest)
      } catch (err) {
        const e = err as NodeJS.ErrnoException
        if (e.code !== 'EEXIST') throw err
      }
    }

    // Plan 33 G1: copy dist/ and dist-hooks/ into staging/runtime/<basename>.
    // This mirrors the compiled artifacts into ~/.anvil/runtime/ so user-facing
    // shims (bin/anvil.cjs, bin/install.cjs) can resolve their entry points
    // without a live source checkout.
    //
    // ANV-0219: retry on ENOENT. Under high test parallelism (many concurrent
    // workers each calling syncAnvilHome), a concurrent rebuild can transiently
    // delete and recreate individual files in dist/ while this cp is in flight.
    // Retrying is safe: the cp target (stagingDir) is per-call unique; the
    // source (dist/) is a shared read-mostly directory that stabilises quickly.
    for (const srcDir of staged.runtimeMirrorSources) {
      const destDir = join(stagingDir, 'runtime', basename(srcDir))
      await mkdir(destDir, { recursive: true })
      let lastErr: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await cp(srcDir, destDir, { recursive: true, force: true })
          lastErr = undefined
          break
        } catch (err) {
          const code = (err as NodeJS.ErrnoException).code
          if (code !== 'ENOENT' && code !== 'EACCES') throw err
          lastErr = err
          // Brief backoff before retry — give a concurrent rebuild time to
          // finish writing the file that disappeared.
          await new Promise<void>((resolve) =>
            setTimeout(resolve, 50 * (attempt + 1)),
          )
        }
      }
      if (lastErr !== undefined) throw lastErr
    }

    // Read version from staged files
    const versionFile = staged.files.find((f) => f.relativePath === 'version')
    const version =
      typeof versionFile?.content === 'string'
        ? versionFile.content.trim()
        : 'unknown'

    // Atomic swap: staging → target
    await atomicSwap(stagingDir, anvilHome)

    return {
      anvilHome,
      version,
      staged: staged.files.length,
      filesWritten: staged.files.map((f) => f.relativePath),
    }
  } catch (err) {
    // Clean up staging on failure
    await rm(stagingDir, { recursive: true, force: true }).catch(() => {})
    throw err
  }
}
