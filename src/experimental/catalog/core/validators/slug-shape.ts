/**
 * ANV-0028 (P3) — Validator 2: slug-shape
 *
 * Checks that the extension slug:
 *   1. Matches the Slug regex from src/core/worktree/types.ts
 *   2. Is not a reserved name (_quarantine, _cache, or any leading-underscore name)
 *
 * Severity: block.
 *
 * Layer 0 — pure; no I/O.
 */

import { Slug } from '../types.js'
import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const SLUG_SHAPE_VALIDATOR_ID = 'slug-shape'

/** Names that are reserved for framework use (decision D7 in ANV-0028). */
const RESERVED_NAMES = new Set(['_quarantine', '_cache'])

/**
 * Returns true when the slug is reserved.
 * Rule: any name starting with `_` is framework-reserved.
 */
function isReserved(slug: string): boolean {
  return slug.startsWith('_') || RESERVED_NAMES.has(slug)
}

export async function validateSlugShape(
  record: QuarantineRecord,
  _ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const slug = record.manifest.name

  // Check Slug regex
  const slugResult = Slug.safeParse(slug)
  if (!slugResult.success) {
    return {
      id: SLUG_SHAPE_VALIDATOR_ID,
      severity: 'block',
      status: 'fail',
      message: `slug "${slug}" does not match required format: ${slugResult.error.issues.map((i) => i.message).join('; ')}`,
      detail: { slug, issues: slugResult.error.issues },
    }
  }

  // Check reserved names
  if (isReserved(slug)) {
    return {
      id: SLUG_SHAPE_VALIDATOR_ID,
      severity: 'block',
      status: 'fail',
      message: `slug "${slug}" is reserved — names starting with "_" are reserved for framework use`,
      detail: { slug, reason: 'reserved-prefix' },
    }
  }

  return {
    id: SLUG_SHAPE_VALIDATOR_ID,
    severity: 'block',
    status: 'pass',
    message: `slug "${slug}" has valid shape and is not reserved`,
  }
}
