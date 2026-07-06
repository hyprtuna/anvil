/**
 * ANV-0028 (P3) — Validator 7: surface-claim
 *
 * If manifest claims a hook (provides.hook is non-empty), content/hooks/
 * must exist and contain at least one hooks.json.
 *
 * Severity: block.
 *
 * Layer 0 — reads content/ directory.
 */

import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { quarantineDir } from '../quarantine.js'
import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const SURFACE_CLAIM_VALIDATOR_ID = 'surface-claim'

async function safeReadDir(dir: string): Promise<string[] | null> {
  try {
    return await readdir(dir)
  } catch {
    return null
  }
}

export async function validateSurfaceClaim(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const provides = record.manifest.provides
  const hooksProvided = provides.hook ?? []

  if (hooksProvided.length === 0) {
    return {
      id: SURFACE_CLAIM_VALIDATOR_ID,
      severity: 'block',
      status: 'pass',
      message: 'no hook claims; surface-claim check not applicable',
    }
  }

  // content/ may be empty (P2 creates it as a stub; P4 populates it)
  // Gate gracefully: if content/ doesn't exist, skip (pass) with a note.
  const contentPath = join(
    quarantineDir(ctx.anvilHome, record.source.id, record.manifest.name),
    'content',
  )

  const hooksDir = join(contentPath, 'hooks')
  const hooksEntries = await safeReadDir(hooksDir)

  if (hooksEntries === null) {
    // hooks/ directory does not exist at all — this is a block violation
    return {
      id: SURFACE_CLAIM_VALIDATOR_ID,
      severity: 'block',
      status: 'fail',
      message: `manifest claims ${hooksProvided.length} hook(s) but content/hooks/ directory does not exist`,
      detail: { claimedHooks: hooksProvided },
    }
  }

  const hooksJsonFiles = hooksEntries.filter((f) => f === 'hooks.json')

  if (hooksJsonFiles.length === 0) {
    return {
      id: SURFACE_CLAIM_VALIDATOR_ID,
      severity: 'block',
      status: 'fail',
      message: `manifest claims ${hooksProvided.length} hook(s) but content/hooks/ contains no hooks.json`,
      detail: { claimedHooks: hooksProvided, foundFiles: hooksEntries },
    }
  }

  return {
    id: SURFACE_CLAIM_VALIDATOR_ID,
    severity: 'block',
    status: 'pass',
    message: `manifest's hook claim(s) are backed by content/hooks/hooks.json`,
  }
}
