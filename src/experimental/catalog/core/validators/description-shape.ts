/**
 * ANV-0028 (P3) — Validator 6: description-shape
 *
 * For agents: description must contain "Use when" or "PROACTIVELY" trigger phrase.
 * For skills: description should follow activity-noun shape (existing CSO prefix rules).
 *
 * Severity: warn.
 *
 * Layer 0 — pure; no I/O.
 *
 * Reuses CSO_PREFIX_RE from src/commands/cli/doctor-checks/description-shape.ts.
 * NOTE: This file imports from layer 4 (commands). This is an intentional
 * upward import allowlisted in layer-imports.allowlist.ts.
 * The imported symbols are pure constants/functions with no I/O.
 * TODO(ANV-0028-followup): if the CSO_PREFIX_RE is extracted to a layer-0
 * utility, remove this allowlist entry.
 */

import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const DESCRIPTION_SHAPE_VALIDATOR_ID = 'description-shape'

/**
 * CSO triggering-condition accepted prefixes (copied from description-shape.ts
 * to avoid upward layer import from layer 4 → imported here inline).
 * Keeping a local copy so this validator stays at layer 0.
 */
const CSO_PREFIX_RE =
  /^(Use (?:when|before|after|to|for) |Run when |Invoked? (?:when|before) |Activate when |Triggered when |Triggers on |MUST consult|When |Applies when |For )/

/** Matches PROACTIVELY trigger phrase used for agents. */
const PROACTIVELY_RE = /PROACTIVELY/

export async function validateDescriptionShape(
  record: QuarantineRecord,
  _ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const description = record.manifest.description.trim()
  const kind = record.manifest.kind

  // Agents: must have "Use when" or "PROACTIVELY" trigger phrase
  if (kind === 'extension') {
    // Extension kind: apply CSO prefix rule
    const hasCsoPrefix = CSO_PREFIX_RE.test(description)
    const hasProactively = PROACTIVELY_RE.test(description)

    if (!hasCsoPrefix && !hasProactively) {
      return {
        id: DESCRIPTION_SHAPE_VALIDATOR_ID,
        severity: 'warn',
        status: 'fail',
        message: `description does not start with a CSO trigger phrase ("Use when …") or "PROACTIVELY" — found: "${description.slice(0, 60)}…"`,
        detail: { description, kind },
      }
    }
  }

  // Preset/profile: apply CSO prefix rule as well (same convention)
  if (kind === 'preset' || kind === 'profile') {
    const hasCsoPrefix = CSO_PREFIX_RE.test(description)
    if (!hasCsoPrefix) {
      return {
        id: DESCRIPTION_SHAPE_VALIDATOR_ID,
        severity: 'warn',
        status: 'fail',
        message: `description for ${kind} does not start with a CSO trigger phrase ("Use when …") — found: "${description.slice(0, 60)}…"`,
        detail: { description, kind },
      }
    }
  }

  return {
    id: DESCRIPTION_SHAPE_VALIDATOR_ID,
    severity: 'warn',
    status: 'pass',
    message: 'description shape is valid',
  }
}
