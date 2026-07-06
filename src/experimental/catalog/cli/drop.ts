/**
 * ANV-0028 (P4) — `anvil catalog drop <quarantine-id>` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: no. Mutates: removes from _quarantine/.
 *
 * Finds the quarantine record by id and removes it.
 * Idempotent: if the record is not found, exits 0 with a message.
 *
 * Exit codes:
 *   0 — dropped or not found (with message)
 *   1 — invalid input
 */

import {
  dropQuarantineRecord,
  listQuarantineRecords,
} from '../core/quarantine.js'
import {
  EXIT_INVALID_INPUT,
  EXIT_OK,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface DropOpts {
  json?: boolean
}

/**
 * Main handler for `anvil catalog drop <quarantine-id>`.
 *
 * @param quarantineId  The quarantine_id to drop.
 * @param opts          Command options.
 * @param anvilHome     Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function dropCommand(
  quarantineId: string,
  opts: DropOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  if (quarantineId.trim().length === 0) {
    process.stderr.write(
      'anvil catalog drop: quarantine-id must not be empty\n',
    )
    return EXIT_INVALID_INPUT
  }

  // Find the record to get sourceId + slug for dropQuarantineRecord
  const records = await listQuarantineRecords(anvilHome)
  const record = records.find((r) => r.quarantine_id === quarantineId)

  if (record === undefined) {
    if (opts.json) {
      writeJson({
        dropped: false,
        quarantine_id: quarantineId,
        reason: 'not-found',
      })
    } else {
      process.stdout.write(
        `No quarantine record found for "${quarantineId}" — nothing to drop.\n`,
      )
    }
    return EXIT_OK
  }

  await dropQuarantineRecord(anvilHome, record.source.id, record.manifest.name)

  if (opts.json) {
    writeJson({ dropped: true, quarantine_id: quarantineId })
  } else {
    process.stdout.write(`Dropped quarantine record "${quarantineId}".\n`)
  }

  return EXIT_OK
}
