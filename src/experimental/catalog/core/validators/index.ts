/**
 * ANV-0028 (P3) — Validation pipeline orchestrator.
 *
 * Runs all 10 validators in fixed order per plan §5.
 * Derives promotion decision from collected outcomes.
 * Writes results to quarantine_dir/validation.json.
 *
 * Layer 0 — may perform disk I/O (reads content/, writes validation.json).
 *
 * TODO(ANV-0028-followup): ctx.bundled sets are empty until ANV-0028 wires the
 * bundled slug inventory (same TODO pattern as install-pipeline.ts).
 */

import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { loadRegistry } from '../../../../installer/extensions/registry.js'
import type { CollisionContext } from '../../../../installer/extensions/types.js'
import { quarantineDir } from '../quarantine.js'
import type {
  PromotionResult,
  QuarantineRecord,
  ValidationOutcome,
} from '../types.js'
import { validateByteMd5Dedupe } from './byte-md5-dedupe.js'
import { validateDescriptionShape } from './description-shape.js'
import { validateLicense } from './license.js'
import { validatePermission } from './permission.js'
import { validateRequiredEnv } from './required-env.js'
import { validateSchema } from './schema.js'
import { validateSlugCollision } from './slug-collision.js'
import { validateSlugShape } from './slug-shape.js'
import { validateSurfaceClaim } from './surface-claim.js'
import { DEFAULT_TOKEN_BUDGET } from './token-budget.js'
import { validateTokenBudget } from './token-budget.js'

// ─── ValidatorContext ─────────────────────────────────────────────────────────

export type ValidatorContext = {
  /** Root of ~/.anvil/ */
  anvilHome: string
  /**
   * Four Set<string> of bundled-core slugs per resource kind.
   * TODO(ANV-0028-followup): populate from the bundled inventory once available.
   */
  bundled: CollisionContext['bundled']
  /**
   * md5 hashes of every .md file in every already-promoted extension.
   * Built by buildValidatorContext from the registry + extension dirs.
   */
  promotedInventoryMd5: Set<string>
  /**
   * For batch-promote runs — other records being promoted in the same batch.
   * Usually empty (single-record promotion).
   */
  candidateBatch: QuarantineRecord[]
  /**
   * Token budget ceiling (sum of inventory token_estimates).
   * Sourced from ANVIL_TOKEN_BUDGET env var or DEFAULT_TOKEN_BUDGET.
   */
  tokenBudget: number
}

// ─── Ordered validator pipeline ───────────────────────────────────────────────

type Validator = (
  record: QuarantineRecord,
  ctx: ValidatorContext,
) => Promise<ValidationOutcome>

const VALIDATORS: readonly Validator[] = [
  validateSchema, // 1 — block
  validateSlugShape, // 2 — block
  validateByteMd5Dedupe, // 3 — warn/block
  validateSlugCollision, // 4 — block
  validatePermission, // 5 — block/warn
  validateDescriptionShape, // 6 — warn
  validateSurfaceClaim, // 7 — block
  validateRequiredEnv, // 8 — warn
  validateTokenBudget, // 9 — warn
  validateLicense, // 10 — warn/block
]

// ─── Atomic write helper ──────────────────────────────────────────────────────

async function atomicWriteJson(
  targetPath: string,
  value: unknown,
): Promise<void> {
  const tmpPath = `${targetPath}.tmp`
  const content = `${JSON.stringify(value, null, 2)}\n`
  await mkdir(join(targetPath, '..'), { recursive: true })
  await writeFile(tmpPath, content, 'utf-8')
  const fh = await open(tmpPath, 'r+')
  await fh.sync()
  await fh.close()
  await rename(tmpPath, targetPath)
}

// ─── buildValidatorContext ────────────────────────────────────────────────────

/**
 * Build a ValidatorContext by:
 *   1. Loading the registry for promoted extension names (collision detection).
 *   2. Walking the installed extensions' file trees to collect md5 hashes.
 *
 * Single source of truth — both P3 (validation) and P4 (promote CLI) use this.
 */
export async function buildValidatorContext(
  anvilHome: string,
  candidateBatch: QuarantineRecord[] = [],
): Promise<ValidatorContext> {
  // Load registry to get promoted extension names
  const registry = await loadRegistry(anvilHome).catch(() => ({
    schema_version: '1.0.0' as const,
    extensions: {} as Record<string, never>,
  }))

  // Build promotedInventoryMd5 by walking installed extension dirs
  const promotedInventoryMd5 = new Set<string>()
  const extensionsRoot = join(anvilHome, 'extensions')

  for (const extName of Object.keys(registry.extensions)) {
    // Skip reserved dirs
    if (extName.startsWith('_')) continue
    const extDir = join(extensionsRoot, extName)
    await walkMd5s(extDir, promotedInventoryMd5)
  }

  // Token budget from env or default
  const envBudget = process.env.ANVIL_TOKEN_BUDGET
  const tokenBudget =
    envBudget !== undefined && /^\d+$/.test(envBudget)
      ? Number.parseInt(envBudget, 10)
      : DEFAULT_TOKEN_BUDGET

  return {
    anvilHome,
    // TODO(ANV-0028-followup): populate bundled sets from actual bundled inventory
    bundled: {
      skill: new Set<string>(),
      agent: new Set<string>(),
      hook: new Set<string>(),
      command: new Set<string>(),
    },
    promotedInventoryMd5,
    candidateBatch,
    tokenBudget,
  }
}

/**
 * Walk a directory recursively, computing md5 hashes of all .md files
 * and adding them to the provided Set.
 */
async function walkMd5s(dir: string, out: Set<string>): Promise<void> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry)
    if (entry.endsWith('.md')) {
      try {
        const content = await readFile(fullPath)
        const { createHash } = await import('node:crypto')
        const md5 = createHash('md5').update(content).digest('hex')
        out.add(md5)
      } catch {
        // Skip unreadable files
      }
    } else {
      // Try as directory
      await walkMd5s(fullPath, out)
    }
  }
}

// ─── runValidationPipeline ────────────────────────────────────────────────────

/**
 * Run all 10 validators in order, collect outcomes, derive decision, write
 * validation.json to the quarantine directory.
 *
 * Decision logic:
 *   - 'blocked' iff any block-severity validator has status 'fail'
 *   - 'warned-but-promoted' iff only warn-severity validators failed
 *   - 'promoted' iff all validators passed
 *
 * Does NOT write into ~/.anvil/extensions/<name>/ — that is P4's job.
 */
export async function runValidationPipeline(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<PromotionResult> {
  const outcomes: ValidationOutcome[] = []

  for (const validator of VALIDATORS) {
    const outcome = await validator(record, ctx)
    outcomes.push(outcome)
  }

  // Derive decision
  const hasBlockFail = outcomes.some(
    (o) => o.severity === 'block' && o.status === 'fail',
  )
  const hasWarnFail = outcomes.some(
    (o) => o.severity === 'warn' && o.status === 'fail',
  )

  let decision: PromotionResult['decision']
  if (hasBlockFail) {
    decision = 'blocked'
  } else if (hasWarnFail) {
    decision = 'warned-but-promoted'
  } else {
    decision = 'promoted'
  }

  const result: PromotionResult = {
    quarantine_id: record.quarantine_id,
    decision,
    validations: outcomes,
  }

  // Write validation.json to the quarantine directory
  const validationPath = join(
    quarantineDir(ctx.anvilHome, record.source.id, record.manifest.name),
    'validation.json',
  )

  await atomicWriteJson(validationPath, {
    results: outcomes,
    decision,
  })

  return result
}
