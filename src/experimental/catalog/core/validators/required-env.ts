/**
 * ANV-0028 (P3) — Validator 8: required-env
 *
 * If manifest declares required_env, each var must be set in the environment
 * OR the promotion emits a warning.
 *
 * Severity: warn.
 *
 * Layer 0 — pure; reads process.env.
 *
 * NOTE: ExtensionManifest in the current schema does not have required_env.
 * This validator checks for an optional extension on the manifest's raw shape.
 * TODO(ANV-0028-followup): add required_env field to ExtensionManifest schema
 * once ANV-0028 full spec defines the field formally.
 */

import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const REQUIRED_ENV_VALIDATOR_ID = 'required-env'

export async function validateRequiredEnv(
  record: QuarantineRecord,
  _ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  // Extract required_env from the manifest's raw shape if present.
  // The field is not yet in the Zod schema, so we access it via type assertion.
  // TODO(ANV-0028-followup): use manifest.required_env directly once schema updated.
  const rawManifest = record.manifest as unknown as Record<string, unknown>
  const requiredEnv: string[] = Array.isArray(rawManifest.required_env)
    ? (rawManifest.required_env as string[]).filter(
        (v): v is string => typeof v === 'string',
      )
    : []

  if (requiredEnv.length === 0) {
    return {
      id: REQUIRED_ENV_VALIDATOR_ID,
      severity: 'warn',
      status: 'pass',
      message: 'no required_env declared',
    }
  }

  const missing = requiredEnv.filter((v) => !process.env[v])

  if (missing.length === 0) {
    return {
      id: REQUIRED_ENV_VALIDATOR_ID,
      severity: 'warn',
      status: 'pass',
      message: `all ${requiredEnv.length} required env var(s) are set`,
    }
  }

  return {
    id: REQUIRED_ENV_VALIDATOR_ID,
    severity: 'warn',
    status: 'fail',
    message: `${missing.length} required env var(s) not set: ${missing.join(', ')} — set before using this extension`,
    detail: { required: requiredEnv, missing },
  }
}
