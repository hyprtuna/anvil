/**
 * ANV-0028 (P3) — Validator 10: license-walk
 *
 * Checks:
 *   - provenance.upstream_license is set AND non-empty AND not 'UNKNOWN' (warn if UNKNOWN)
 *   - Cross-checks repo-root LICENSE file against plugin.json when both available (warn on mismatch)
 *   - Blocks if BOTH provenance.upstream_license is empty AND no LICENSE file present
 *
 * Severity: warn if mismatch or UNKNOWN, block if both empty.
 *
 * Layer 0 — reads content/ directory.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { quarantineDir } from '../quarantine.js'
import type { QuarantineRecord, ValidationOutcome } from '../types.js'
import type { ValidatorContext } from './index.js'

export const LICENSE_VALIDATOR_ID = 'license-walk'

async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

export async function validateLicense(
  record: QuarantineRecord,
  ctx: ValidatorContext,
): Promise<ValidationOutcome> {
  const upstreamLicense = record.provenance.upstream_license.trim()
  const contentPath = join(
    quarantineDir(ctx.anvilHome, record.source.id, record.manifest.name),
    'content',
  )

  // Try to read a LICENSE file from content/
  const licenseFileContent = await safeReadFile(join(contentPath, 'LICENSE'))

  // Case 1: both upstream_license is empty/UNKNOWN AND no LICENSE file
  const licenseEmpty =
    upstreamLicense === '' || upstreamLicense.toUpperCase() === 'UNKNOWN'
  if (licenseEmpty && licenseFileContent === null) {
    return {
      id: LICENSE_VALIDATOR_ID,
      severity: 'block',
      status: 'fail',
      message:
        'no license information available: upstream_license is empty/UNKNOWN and no content/LICENSE file found',
      detail: { upstream_license: upstreamLicense, licenseFile: null },
    }
  }

  const issues: string[] = []

  // Case 2: upstream_license is UNKNOWN (warn)
  if (upstreamLicense.toUpperCase() === 'UNKNOWN') {
    issues.push(
      `upstream_license is 'UNKNOWN' — determine and set the correct SPDX license expression`,
    )
  }

  // Case 3: cross-check LICENSE file content for known SPDX identifiers
  if (licenseFileContent !== null && upstreamLicense !== '' && !licenseEmpty) {
    // Simple heuristic: check if the upstream_license SPDX id appears in the LICENSE file
    // This is intentionally loose (case-insensitive substring match).
    const spdxId = upstreamLicense.toUpperCase()
    const licenseUpper = licenseFileContent.toUpperCase()

    // Common SPDX to content mappings
    const SPDX_HINTS: Record<string, string[]> = {
      MIT: ['MIT'],
      'APACHE-2.0': ['APACHE', 'APACHE-2.0', 'APACHE 2.0'],
      'GPL-3.0': ['GPL-3', 'GNU GENERAL PUBLIC LICENSE.*VERSION 3'],
      'GPL-2.0': ['GPL-2', 'GNU GENERAL PUBLIC LICENSE.*VERSION 2'],
      'BSD-2-CLAUSE': ['BSD 2-CLAUSE', 'SIMPLIFIED BSD'],
      'BSD-3-CLAUSE': ['BSD 3-CLAUSE', 'NEW BSD', 'REVISED BSD'],
      ISC: ['ISC'],
      'AGPL-3.0': ['AGPL-3', 'GNU AFFERO'],
    }

    const hints = SPDX_HINTS[spdxId]
    if (hints !== undefined) {
      const matchesAny = hints.some((hint) => {
        try {
          return new RegExp(hint).test(licenseUpper)
        } catch {
          return licenseUpper.includes(hint)
        }
      })
      if (!matchesAny) {
        issues.push(
          `upstream_license '${upstreamLicense}' may not match content/LICENSE file (no recognizable ${spdxId} markers found)`,
        )
      }
    }
  }

  if (issues.length === 0) {
    return {
      id: LICENSE_VALIDATOR_ID,
      severity: 'warn',
      status: 'pass',
      message: `license validated: upstream_license='${upstreamLicense}'`,
    }
  }

  return {
    id: LICENSE_VALIDATOR_ID,
    severity: 'warn',
    status: 'fail',
    message: issues.join('; '),
    detail: {
      upstream_license: upstreamLicense,
      hasLicenseFile: licenseFileContent !== null,
      issues,
    },
  }
}
