import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * Telemetry parity (D-11).
 *
 * Mirrors agent-redirect.ts telemetry shape — not imported from there
 * to preserve the self-contained plugin bundle constraint.
 * Appends a JSONL line to ~/.anvil/logs/plugin-events.jsonl on each
 * agent dispatch. All errors are swallowed (best-effort).
 */

interface PluginEventRecord {
  ts: string
  slug: string
  kind: 'agent_dispatch'
  source: 'opencode-plugin'
}

/**
 * Append a dispatch telemetry record. Swallows all errors.
 *
 * @param slug - The dispatched agent slug.
 * @param logsDir - Override for the logs directory (test escape hatch).
 */
export async function appendTelemetry(
  slug: string,
  logsDir?: string,
): Promise<void> {
  try {
    const dir = logsDir ?? join(homedir(), '.anvil', 'logs')
    const file = join(dir, 'plugin-events.jsonl')
    await mkdir(dirname(file), { recursive: true })
    const record: PluginEventRecord = {
      ts: new Date().toISOString(),
      slug,
      kind: 'agent_dispatch',
      source: 'opencode-plugin',
    }
    await appendFile(file, `${JSON.stringify(record)}\n`, 'utf-8')
  } catch {
    // Best-effort — never throw from telemetry.
  }
}
