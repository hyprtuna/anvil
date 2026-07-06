/**
 * ANV-0028 (P3) — Validator 4: slug-collision
 *
 * Three-tier collision detection reusing detectCollisions from the installer.
 * Severity: block.
 *
 * Layer 0 — disk-free; delegates to the collision detector.
 *
 * NOTE: This file imports from src/installer/extensions/collisions.ts (layer 7).
 * This is an intentional upward import allowlisted in layer-imports.allowlist.ts.
 * The collision detector is pure (no I/O) so the layer 0 constraint is satisfied
 * in practice even though the file lives in layer 7.
 * TODO(ANV-0028-followup): ctx.bundled sets are empty until ANV-0028 wires the
 * bundled slug inventory. Tier-2 collision detection is a no-op until then.
 */

import { detectCollisions } from '../../../../installer/extensions/collisions.js'
import type {
  Collision,
  CollisionContext,
} from '../../../../installer/extensions/types.js'
import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const SLUG_COLLISION_VALIDATOR_ID = 'slug-collision'

export async function validateSlugCollision(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  // Synthesise a CollisionContext for the three-tier check.
  // The manifest.provides field on the QuarantineRecord's manifest is used
  // for tier-2 (bundled) and tier-3 (installed provides) collision checks.
  //
  // For the candidate batch: each batch member is an extra "installed" entry
  // so that batch-vs-batch collisions are also caught.
  const batchInstalled = ctx.candidateBatch
    .filter((r) => r.quarantine_id !== record.quarantine_id)
    .map((r) => ({
      name: r.manifest.name,
      provides: r.manifest.provides,
    }))

  const collisionCtx: CollisionContext = {
    bundled: ctx.bundled,
    installed: batchInstalled,
  }

  const collisions = detectCollisions(record.manifest, collisionCtx)

  if (collisions.length === 0) {
    return {
      id: SLUG_COLLISION_VALIDATOR_ID,
      severity: 'block',
      status: 'pass',
      message: 'no slug collisions detected across all three tiers',
    }
  }

  const preview = collisions
    .slice(0, 3)
    .map(
      (c: Collision) =>
        `tier-${c.tier} ${c.kind} "${c.slug}" conflicts with ${c.conflictingSource}`,
    )
    .join('; ')
  const more = collisions.length > 3 ? ` +${collisions.length - 3} more` : ''

  return {
    id: SLUG_COLLISION_VALIDATOR_ID,
    severity: 'block',
    status: 'fail',
    message: `${collisions.length} slug collision(s) detected: ${preview}${more}`,
    detail: collisions,
  }
}
