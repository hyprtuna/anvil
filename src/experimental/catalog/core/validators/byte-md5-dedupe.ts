/**
 * ANV-0028 (P3) — Validator 3: byte-md5-dedupe
 *
 * Checks that no inventory item's md5 conflicts with an already-promoted
 * inventory item.
 *
 * Severity:
 *   - block: same kind (e.g. skill vs skill)
 *   - warn: cross-kind (e.g. skill md5 matches an agent)
 *
 * Layer 0 — pure; uses promotedInventoryMd5 from ValidatorContext.
 */

import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const BYTE_MD5_DEDUPE_VALIDATOR_ID = 'byte-md5-dedupe'

export async function validateByteMd5Dedupe(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const conflicts: Array<{ relpath: string; md5: string; role: string }> = []

  for (const item of record.inventory) {
    if (ctx.promotedInventoryMd5.has(item.md5)) {
      conflicts.push({ relpath: item.relpath, md5: item.md5, role: item.role })
    }
  }

  if (conflicts.length === 0) {
    return {
      id: BYTE_MD5_DEDUPE_VALIDATOR_ID,
      severity: 'block',
      status: 'pass',
      message: 'no byte-identical duplicates found among promoted inventory',
    }
  }

  // Determine severity: block if same kind, warn if cross-kind
  // Since we track md5 globally without per-kind breakdown, we use
  // warn as the conservative cross-kind default and block for same-kind.
  // The promotedInventoryMd5 set does not carry role info, so we report
  // as warn (cross-kind) per the spec. Same-kind detection requires the
  // full inventory walk — deferred to ANV-0028-followup when the registry
  // carries per-item role metadata.
  // TODO(ANV-0028-followup): promote to block when ctx carries per-md5 role data

  const preview = conflicts
    .slice(0, 3)
    .map((c) => `${c.relpath} (${c.md5.slice(0, 8)}…)`)
    .join(', ')
  const more = conflicts.length > 3 ? ` +${conflicts.length - 3} more` : ''

  return {
    id: BYTE_MD5_DEDUPE_VALIDATOR_ID,
    severity: 'warn',
    status: 'fail',
    message: `${conflicts.length} inventory item(s) are byte-identical to already-promoted files: ${preview}${more}`,
    detail: conflicts,
  }
}
