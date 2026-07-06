/**
 * ANV-0028 (P4) — `anvil catalog status` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: no. Mutates: no.
 *
 * Lists all quarantined entries using listQuarantineRecords.
 * Includes last validation decision if validation.json exists.
 *
 * Exit code: 0 always.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { listQuarantineRecords, quarantineDir } from '../core/quarantine.js'
import type { QuarantineRecord } from '../core/types.js'
import { EXIT_OK, resolveAnvilHome, writeJson } from './common.js'

export interface StatusOpts {
  json?: boolean
}

type ValidationDecision = 'promoted' | 'blocked' | 'warned-but-promoted' | null

/**
 * Try to read the decision from a validation.json file.
 */
async function readDecision(
  anvilHome: string,
  record: QuarantineRecord,
): Promise<ValidationDecision> {
  const vPath = join(
    quarantineDir(anvilHome, record.source.id, record.manifest.name),
    'validation.json',
  )
  try {
    const raw = await readFile(vPath, 'utf-8')
    const parsed = JSON.parse(raw) as { decision?: string }
    if (
      parsed.decision === 'promoted' ||
      parsed.decision === 'blocked' ||
      parsed.decision === 'warned-but-promoted'
    ) {
      return parsed.decision
    }
    return null
  } catch {
    return null
  }
}

type StatusRow = {
  quarantine_id: string
  source_id: string
  slug: string
  created_at: string
  validation_decision: ValidationDecision
}

/**
 * Main handler for `anvil catalog status`.
 *
 * @param opts      Command options.
 * @param anvilHome Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code (always 0).
 */
export async function statusCommand(
  opts: StatusOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  const records = await listQuarantineRecords(anvilHome)

  const rows: StatusRow[] = await Promise.all(
    records.map(async (r) => ({
      quarantine_id: r.quarantine_id,
      source_id: r.source.id,
      slug: r.manifest.name,
      created_at: r.created_at,
      validation_decision: await readDecision(anvilHome, r),
    })),
  )

  if (opts.json) {
    writeJson({ records: rows })
    return EXIT_OK
  }

  if (rows.length === 0) {
    process.stdout.write('Quarantine is empty.\n')
    return EXIT_OK
  }

  process.stdout.write(`${rows.length} quarantined entry/entries:\n\n`)
  for (const row of rows) {
    const decision = row.validation_decision ?? 'not-validated'
    process.stdout.write(
      `  ${row.quarantine_id}\n` +
        `    source:   ${row.source_id}\n` +
        `    slug:     ${row.slug}\n` +
        `    created:  ${row.created_at.slice(0, 10)}\n` +
        `    decision: ${decision}\n\n`,
    )
  }

  return EXIT_OK
}
