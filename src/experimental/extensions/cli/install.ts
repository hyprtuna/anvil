/**
 * ANV-0203 (P3) / ANV-0248 — `anvil extension install <source>` CLI command.
 *
 * Experimental surface — registered via src/experimental/register-cli.ts.
 * Imports from: ../installer/ (experimental extensions installer).
 *
 * Auto-detects source type:
 *   - .tar.gz / .tgz / .zip → installFromArchive
 *   - directory → installFromDirectory
 *
 * Exit codes (plan §4.1):
 *   0  — success / skip
 *   1  — INVALID_MANIFEST or RENAME_REQUIRED (bad flag combo)
 *   2  — EXTRACTION_FAILED | PATH_TRAVERSAL
 *   3  — UNRESOLVED_COLLISION | CANNOT_REPLACE_BUNDLED
 *   4  — non-interactive: collisions detected but neither --on-collision nor --yes set
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type {
  InstallOutcome,
  OnCollisionStrategy,
} from '../../../installer/extensions/install-pipeline.js'
import {
  installFromArchive,
  installFromDirectory,
} from '../../../installer/extensions/install-pipeline.js'
import { resolveCollision } from './collision-resolver.js'
import {
  formatHumanInstallResult,
  mapErrorToExitCode,
  resolveAnvilHome,
} from './common.js'

export interface InstallExtensionOpts {
  /** Collision resolution strategy. When absent, P3 uses default logic (see below). */
  onCollision?: OnCollisionStrategy
  /** Rename slug (required when onCollision === 'rename'). */
  rename?: string
  /** Skip prompts; when --on-collision absent, defaults to 'abort'. */
  yes?: boolean
  /** Emit JSON output. */
  json?: boolean
}

/**
 * Validate that --rename is only supplied with onCollision=rename.
 * Returns an error message string, or null if valid.
 */
function validateRenameFlag(opts: InstallExtensionOpts): string | null {
  if (opts.rename !== undefined && opts.onCollision !== 'rename') {
    return '--rename requires --on-collision=rename'
  }
  return null
}

/**
 * Determine the effective onCollision strategy.
 *
 * Resolution order:
 *   1. If --on-collision is set, use it.
 *   2. If --yes is set (without --on-collision), default to 'abort'.
 *   3. Otherwise: undefined — caller must handle the "no strategy" case.
 */
function resolveStrategy(
  opts: InstallExtensionOpts,
): OnCollisionStrategy | undefined {
  if (opts.onCollision !== undefined) return opts.onCollision
  if (opts.yes) return 'abort'
  return undefined
}

/**
 * Detect source type from path extension.
 * Archive: ends with .tar.gz, .tgz, or .zip.
 * Directory: is a directory on disk.
 */
function isArchivePath(source: string): boolean {
  return (
    source.endsWith('.tar.gz') ||
    source.endsWith('.tgz') ||
    source.endsWith('.zip')
  )
}

/**
 * Main handler for `anvil extension install <source>`.
 *
 * @param source  Path to a local archive or directory containing manifest.json.
 * @param opts    Command options (flags).
 * @param anvilHome  Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code (number).
 */
export async function installExtensionCommand(
  source: string,
  opts: InstallExtensionOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  // Validate --rename flag usage
  const renameErr = validateRenameFlag(opts)
  if (renameErr) {
    process.stderr.write(`anvil extension install: ${renameErr}\n`)
    return 1
  }

  // Resolve strategy
  const strategy = resolveStrategy(opts)

  // Eagerly validate: rename strategy requires --rename to be set
  if (strategy === 'rename' && !opts.rename) {
    process.stderr.write(
      'anvil extension install: RENAME_REQUIRED: --on-collision=rename requires --rename <slug>\n',
    )
    return 1
  }

  // ── Step 1: probe run with 'abort' to surface any collisions ─────────────
  // We always probe first so that when strategy is undefined (no --on-collision,
  // no --yes) we can hand the collision list to the interactive resolver rather
  // than blindly running with whatever strategy was set.
  const probeOpts = {
    onCollision: 'abort' as OnCollisionStrategy,
    rename: opts.rename,
  }

  let probeOutcome: InstallOutcome
  try {
    if (isArchivePath(source)) {
      probeOutcome = await installFromArchive(source, probeOpts, anvilHome)
    } else {
      // Check source exists and is a directory
      if (!existsSync(source)) {
        process.stderr.write(
          `anvil extension install: source not found: ${source}\n`,
        )
        return 1
      }
      const stat = statSync(source)
      if (!stat.isDirectory()) {
        process.stderr.write(
          `anvil extension install: source is not a directory or archive: ${source}\n`,
        )
        return 1
      }
      probeOutcome = await installFromDirectory(source, probeOpts, anvilHome)
    }
  } catch (err) {
    process.stderr.write(
      `anvil extension install: unexpected error: ${(err as Error).message}\n`,
    )
    return 2
  }

  // ── Step 2: if probe succeeded, we're done (no collisions) ───────────────
  if (probeOutcome.status !== 'aborted') {
    const { record } = probeOutcome
    if (opts.json) {
      const jsonPayload = {
        status: probeOutcome.status,
        name: record.name,
        version: record.version,
        source: record.source.kind,
        collisions: [] as unknown[],
      }
      process.stdout.write(`${JSON.stringify(jsonPayload, null, 2)}\n`)
      return 0
    }
    const sourceLabel = record.source.path
    process.stdout.write(
      formatHumanInstallResult({
        status: probeOutcome.status,
        name: record.name,
        version: record.version,
        source: sourceLabel,
      }),
    )
    return 0
  }

  // ── Step 3: probe aborted — check if it was a collision ──────────────────
  const probeError = probeOutcome.error

  if (probeError.kind !== 'UNRESOLVED_COLLISION') {
    // Non-collision error — map to exit code normally
    const exitCode = mapErrorToExitCode(probeError)
    const detail =
      'detail' in probeError ? probeError.detail : `${probeError.kind}`
    process.stderr.write(
      `anvil extension install: ${probeError.kind}: ${detail}\n`,
    )
    return exitCode
  }

  // ── Step 4: UNRESOLVED_COLLISION — apply strategy or resolve interactively ─
  const collisions = probeError.collisions

  if (strategy !== undefined) {
    // Strategy already known (--on-collision was set) — re-run with it
    const resolvedOpts = { onCollision: strategy, rename: opts.rename }
    let outcome: InstallOutcome
    try {
      if (isArchivePath(source)) {
        outcome = await installFromArchive(source, resolvedOpts, anvilHome)
      } else {
        outcome = await installFromDirectory(source, resolvedOpts, anvilHome)
      }
    } catch (err) {
      process.stderr.write(
        `anvil extension install: unexpected error: ${(err as Error).message}\n`,
      )
      return 2
    }

    if (outcome.status === 'aborted') {
      const error = outcome.error
      const exitCode = mapErrorToExitCode(error)
      const detail = 'detail' in error ? error.detail : `${error.kind}`
      process.stderr.write(
        `anvil extension install: ${error.kind}: ${detail}\n`,
      )
      return exitCode
    }

    const { record } = outcome
    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({ status: outcome.status, name: record.name, version: record.version, source: record.source.kind, collisions: [] }, null, 2)}\n`,
      )
      return 0
    }
    process.stdout.write(
      formatHumanInstallResult({
        status: outcome.status,
        name: record.name,
        version: record.version,
        source: record.source.path,
      }),
    )
    return 0
  }

  // ── Step 5: no strategy set — invoke interactive resolver (P5) ───────────
  // Read manifest name/version from source for the resolver context.
  // At this point we know the source is valid (the probe parsed it).
  let manifestName = 'unknown'
  let manifestVersion = 'unknown'
  try {
    const manifestPath = isArchivePath(source)
      ? null // archive: manifest was extracted to tmp; use tier-1 collision slug as best proxy
      : join(source, 'manifest.json')
    if (manifestPath) {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<
        string,
        unknown
      >
      if (typeof raw.name === 'string') manifestName = raw.name
      if (typeof raw.version === 'string') manifestVersion = raw.version
    } else {
      // For archives, tier-1 collision slug IS the manifest name
      const tier1 = collisions.find((c) => c.tier === 1)
      if (tier1) {
        manifestName = tier1.slug
      }
    }
  } catch {
    // Best-effort; resolver still works with 'unknown'
  }

  const decision = await resolveCollision({
    manifestName,
    manifestVersion,
    collisions,
    isHostClaude: process.env.ANVIL_HOST === 'claude-code',
    isTTY: process.stdin.isTTY === true,
  })

  if (decision.kind === 'host-prompt-emitted') {
    // Host harness will re-invoke us with --on-collision=<choice>
    return 10
  }

  if (decision.kind === 'no-channel') {
    process.stderr.write(`anvil extension install: ${decision.detail}\n`)
    return 4
  }

  // decision.kind === 'strategy' — re-run pipeline with resolved strategy
  const finalOpts = {
    onCollision: decision.strategy,
    rename: decision.rename ?? opts.rename,
  }

  let outcome: InstallOutcome
  try {
    if (isArchivePath(source)) {
      outcome = await installFromArchive(source, finalOpts, anvilHome)
    } else {
      outcome = await installFromDirectory(source, finalOpts, anvilHome)
    }
  } catch (err) {
    process.stderr.write(
      `anvil extension install: unexpected error: ${(err as Error).message}\n`,
    )
    return 2
  }

  if (outcome.status === 'aborted') {
    const error = outcome.error
    const exitCode = mapErrorToExitCode(error)
    const detail = 'detail' in error ? error.detail : `${error.kind}`
    process.stderr.write(`anvil extension install: ${error.kind}: ${detail}\n`)
    return exitCode
  }

  // Success or skipped
  const { record } = outcome

  if (opts.json) {
    const jsonPayload = {
      status: outcome.status,
      name: record.name,
      version: record.version,
      source: record.source.kind,
      collisions: [] as unknown[],
    }
    process.stdout.write(`${JSON.stringify(jsonPayload, null, 2)}\n`)
    return 0
  }

  const sourceLabel =
    record.source.kind === 'archive' ? record.source.path : record.source.path
  process.stdout.write(
    formatHumanInstallResult({
      status: outcome.status,
      name: record.name,
      version: record.version,
      source: sourceLabel,
    }),
  )
  return 0
}
