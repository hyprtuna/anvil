/**
 * ANV-0028 (P4) — `anvil catalog promote <quarantine-id> [--accept-warnings]` CLI command.
 *
 * Layer 4 — commands leaf.
 * Network: no. Mutates: promotes to ~/.anvil/extensions/<name>/.
 *
 * Algorithm:
 *   1. Find the quarantine record matching the quarantine_id.
 *   2. Run the validation pipeline (runValidationPipeline).
 *   3. If decision === 'promoted' (or 'warned-but-promoted' + --accept-warnings):
 *      call installFromDirectory(quarantineDir/content, {onCollision:'fail'}, anvilHome).
 *   4. Update validation.json with the result.
 *
 * Exit codes:
 *   0 — promoted
 *   1 — unknown quarantine_id or bad input
 *   3 — validation blocked (block-severity fail with no override)
 */

import { mkdir, open, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { installFromDirectory } from '../../../installer/extensions/install-pipeline.js'
import { listQuarantineRecords, quarantineDir } from '../core/quarantine.js'
import type { PromotionResult } from '../core/types.js'
import {
  buildValidatorContext,
  runValidationPipeline,
} from '../core/validators/index.js'
import {
  EXIT_INVALID_INPUT,
  EXIT_OK,
  EXIT_VALIDATION_BLOCKED,
  resolveAnvilHome,
  writeJson,
} from './common.js'

export interface PromoteOpts {
  acceptWarnings?: boolean
  json?: boolean
}

/**
 * Atomic write helper for validation.json.
 */
async function writeValidationJson(dir: string, value: unknown): Promise<void> {
  const targetPath = join(dir, 'validation.json')
  const tmpPath = `${targetPath}.tmp`
  const content = `${JSON.stringify(value, null, 2)}\n`
  await mkdir(dir, { recursive: true })
  await writeFile(tmpPath, content, 'utf-8')
  const fh = await open(tmpPath, 'r+')
  await fh.sync()
  await fh.close()
  await rename(tmpPath, targetPath)
}

/**
 * Main handler for `anvil catalog promote <quarantine-id>`.
 *
 * @param quarantineId  The quarantine_id to promote.
 * @param opts          Command options.
 * @param anvilHome     Resolved ~/.anvil directory (injectable for testing).
 * @returns Exit code.
 */
export async function promoteCommand(
  quarantineId: string,
  opts: PromoteOpts,
  anvilHome: string = resolveAnvilHome(),
): Promise<number> {
  if (quarantineId.trim().length === 0) {
    process.stderr.write(
      'anvil catalog promote: quarantine-id must not be empty\n',
    )
    return EXIT_INVALID_INPUT
  }

  // Find the quarantine record by id
  const records = await listQuarantineRecords(anvilHome)
  const record = records.find((r) => r.quarantine_id === quarantineId)

  if (record === undefined) {
    process.stderr.write(
      `anvil catalog promote: no quarantine record found for id "${quarantineId}"\nRun \`anvil catalog status\` to list available quarantine entries.\n`,
    )
    return EXIT_INVALID_INPUT
  }

  // Build validator context and run the pipeline
  const ctx = await buildValidatorContext(anvilHome)
  const result: PromotionResult = await runValidationPipeline(record, ctx)

  const qDir = quarantineDir(anvilHome, record.source.id, record.manifest.name)

  // Determine if we can proceed
  const canPromote =
    result.decision === 'promoted' ||
    (result.decision === 'warned-but-promoted' && opts.acceptWarnings !== false)

  if (!canPromote && result.decision !== 'promoted') {
    // Blocked
    await writeValidationJson(qDir, {
      results: result.validations,
      decision: result.decision,
    })

    const blockedValidators = result.validations
      .filter((v) => v.severity === 'block' && v.status === 'fail')
      .map((v) => `  [${v.id}] ${v.message}`)
      .join('\n')

    if (opts.json) {
      writeJson(result)
      return EXIT_VALIDATION_BLOCKED
    }

    process.stderr.write(
      `anvil catalog promote: validation blocked for "${quarantineId}"\n${
        blockedValidators ? `\nBlocking issues:\n${blockedValidators}\n` : ''
      }\nRun \`anvil catalog status --json\` to see the full validation report.\n`,
    )
    return EXIT_VALIDATION_BLOCKED
  }

  // Proceed with promotion via installFromDirectory
  const contentDir = join(qDir, 'content')
  const installResult = await installFromDirectory(
    contentDir,
    { onCollision: 'fail' },
    anvilHome,
  )

  let finalResult: PromotionResult

  if (installResult.status === 'aborted') {
    const detail =
      'detail' in installResult.error
        ? installResult.error.detail
        : installResult.error.kind
    finalResult = {
      ...result,
      decision: 'blocked',
      rolled_back: true,
    }
    await writeValidationJson(qDir, {
      results: result.validations,
      decision: 'blocked',
      install_error: detail,
    })

    if (opts.json) {
      writeJson(finalResult)
    } else {
      process.stderr.write(`anvil catalog promote: install failed: ${detail}\n`)
    }
    return EXIT_VALIDATION_BLOCKED
  }

  // Success — update validation.json
  finalResult = {
    ...result,
    written_paths: [installResult.record.name],
  }

  await writeValidationJson(qDir, {
    results: result.validations,
    decision: result.decision,
    promoted_at: new Date().toISOString(),
    installed_name: installResult.record.name,
  })

  if (opts.json) {
    writeJson(finalResult)
    return EXIT_OK
  }

  const warnCount = result.validations.filter(
    (v) => v.severity === 'warn' && v.status === 'fail',
  ).length

  process.stdout.write(
    `Promoted ${quarantineId} → ${installResult.record.name}@${installResult.record.version}\n`,
  )
  if (warnCount > 0) {
    process.stdout.write(
      `  ${warnCount} warning(s) — review \`anvil catalog status\` for details.\n`,
    )
  }

  return EXIT_OK
}
