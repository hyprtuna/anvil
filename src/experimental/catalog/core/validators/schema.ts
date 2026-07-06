/**
 * ANV-0028 (P3) — Validator 1: schema
 *
 * Re-validates record.manifest against the ExtensionManifest schema.
 * Severity: block.
 *
 * Layer 0 — pure; no I/O.
 */

import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const SCHEMA_VALIDATOR_ID = 'schema'

// Inline re-import of the catalog-local copy of ExtensionManifest schema
// (types.ts has it re-exported as part of QuarantineRecord.manifest — we
// need to re-parse the stored snapshot to confirm it still validates).
import { QuarantineRecord as QR } from '../types.js'

export async function validateSchema(
  record: QuarantineRecord,
  _ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  // Re-parse the manifest field through the full Zod schema
  const manifestSchema = QR.shape.manifest
  const result = manifestSchema.safeParse(record.manifest)

  if (result.success) {
    return {
      id: SCHEMA_VALIDATOR_ID,
      severity: 'block',
      status: 'pass',
      message: 'manifest validates against ExtensionManifest schema',
    }
  }

  const issues = result.error.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ')

  return {
    id: SCHEMA_VALIDATOR_ID,
    severity: 'block',
    status: 'fail',
    message: `manifest failed schema validation: ${issues}`,
    detail: result.error.issues,
  }
}
