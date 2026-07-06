/**
 * ANV-0028 (P5) — Doctor rows for catalog quarantine state + cache health.
 *
 * Exports:
 *   - `buildCatalogDoctorRows` — pure builder, no I/O, fully testable.
 *   - `pushCatalogChecks`      — thin I/O wrapper; loads quarantine records
 *                                and cache meta, calls builder, pushes rows.
 *
 * Layer 4 (commands/cli/doctor-checks/). Imports allowed from:
 *   - layers 0–3 (core, intent, skills, hooks, agents)
 *   - layer 7 (installer/extensions/)
 *
 * Pure builder MUST NOT call fs, path, os, or any I/O API.
 *
 * Row semantics (per plan §7):
 *
 * catalog-quarantine-state  ("Catalog quarantine"):
 *   pass  — _quarantine/ is empty OR every entry has decision === 'promoted'
 *   warn  — ≥1 entry is pending review or has unresolved warnings
 *   fail  — ≥1 entry is blocked
 *   skip  — _quarantine/ absent (expectedAbsence: true)
 *
 * catalog-cache-health  ("Catalog cache"):
 *   pass  — every source's index TTL is fresh (last_success within 24h)
 *   warn  — ≥1 source is stale-fallback (last_success > 24h ago or absent)
 *   skip  — offline mode (ANVIL_OFFLINE=1) OR no sources configured
 *           (expectedAbsence: true)
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CacheMeta } from './core/cache.js'
import { readMeta } from './core/cache.js'
import {
  listQuarantineRecords,
  quarantineDir,
  quarantineRoot,
} from './core/quarantine.js'
import { getBuiltInSources } from './core/sources.js'
import type { QuarantineRecord } from './core/types.js'

// ─── Local Check interface (mirrors doctor.ts) ─────────────────────────────────

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/** 24h TTL for index freshness (in milliseconds). */
const INDEX_TTL_MS = 24 * 60 * 60 * 1000

const ROW_QUARANTINE = 'Catalog quarantine'
const ROW_CACHE = 'Catalog cache'

// ─── Row payload types (pure builder outputs) ──────────────────────────────────

export interface QuarantineStateRow {
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
}

export interface CacheHealthRow {
  status: 'pass' | 'warn' | 'skip'
  detail: string
  expectedAbsence?: boolean
}

export interface CatalogDoctorRows {
  quarantineState: QuarantineStateRow
  cacheHealth: CacheHealthRow
}

// ─── Pure builder ─────────────────────────────────────────────────────────────

/**
 * Build both catalog doctor row payloads from pre-loaded data.
 * No I/O — accepts pre-loaded records + meta.
 *
 * @param args.quarantineRecords    All quarantine records (empty when dir absent).
 * @param args.quarantineDirAbsent  True when _quarantine/ directory does not exist.
 * @param args.quarantineDecisions  Map of quarantine_id → validation decision string.
 * @param args.cacheMeta            Map of sourceId → CacheMeta (or null when absent).
 * @param args.offlineMode          True when ANVIL_OFFLINE=1 or no sources configured.
 * @param args.sourceCount          Total number of configured sources.
 * @param args.now                  Current timestamp (injectable for testing).
 */
export function buildCatalogDoctorRows(args: {
  quarantineRecords: QuarantineRecord[]
  quarantineDirAbsent: boolean
  quarantineDecisions: Record<string, string | undefined>
  cacheMeta: Record<string, CacheMeta | null>
  offlineMode: boolean
  sourceCount: number
  now?: Date
}): CatalogDoctorRows {
  const {
    quarantineRecords,
    quarantineDirAbsent,
    quarantineDecisions,
    cacheMeta,
    offlineMode,
    sourceCount,
  } = args
  const now = args.now ?? new Date()

  // ── Row 1: catalog-quarantine-state ──────────────────────────────────────────

  let quarantineState: QuarantineStateRow

  if (quarantineDirAbsent) {
    quarantineState = {
      status: 'skip',
      detail: '_quarantine/ directory absent — no catalog fetches yet',
      expectedAbsence: true,
    }
  } else if (quarantineRecords.length === 0) {
    quarantineState = {
      status: 'pass',
      detail: 'quarantine empty — nothing pending promotion',
    }
  } else {
    let hasBlocked = false
    let allPromoted = true

    for (const record of quarantineRecords) {
      const decision = quarantineDecisions[record.quarantine_id]
      if (decision === 'blocked') {
        hasBlocked = true
        allPromoted = false
      } else if (decision !== 'promoted') {
        // pending review or warned-but-promoted → not all promoted
        allPromoted = false
      }
    }

    if (hasBlocked) {
      quarantineState = {
        status: 'fail',
        detail: `${quarantineRecords.length} quarantine entry(s) — ≥1 entry is blocked; run \`anvil catalog status\` to review`,
      }
    } else if (allPromoted) {
      quarantineState = {
        status: 'pass',
        detail: `${quarantineRecords.length} quarantine entry(s), all promoted`,
      }
    } else {
      quarantineState = {
        status: 'warn',
        detail: `${quarantineRecords.length} quarantine entry(s) pending review — run \`anvil catalog promote <id>\` or \`anvil catalog drop <id>\``,
      }
    }
  }

  // ── Row 2: catalog-cache-health ───────────────────────────────────────────────

  let cacheHealth: CacheHealthRow

  if (offlineMode || sourceCount === 0) {
    const reason = offlineMode
      ? 'offline mode (ANVIL_OFFLINE=1)'
      : 'no catalog sources configured'
    cacheHealth = {
      status: 'skip',
      detail: `cache health skipped — ${reason}`,
      expectedAbsence: true,
    }
  } else {
    const staleSources: string[] = []
    const freshSources: string[] = []

    for (const [sourceId, meta] of Object.entries(cacheMeta)) {
      if (meta?.last_success === undefined) {
        staleSources.push(sourceId)
        continue
      }
      const lastSuccessMs = new Date(meta.last_success).getTime()
      const ageMs = now.getTime() - lastSuccessMs
      if (ageMs > INDEX_TTL_MS) {
        staleSources.push(sourceId)
      } else {
        freshSources.push(sourceId)
      }
    }

    if (staleSources.length === 0) {
      cacheHealth = {
        status: 'pass',
        detail: `${freshSources.length} source(s) fresh (index TTL < 24h)`,
      }
    } else {
      const staleLabel = staleSources.join(', ')
      cacheHealth = {
        status: 'warn',
        detail: `${staleSources.length} source(s) stale or never fetched: ${staleLabel} — run \`anvil catalog refresh\``,
      }
    }
  }

  return { quarantineState, cacheHealth }
}

// ─── Thin I/O wrapper ─────────────────────────────────────────────────────────

/**
 * Load quarantine records + cache meta, build the two catalog doctor rows,
 * and push them to the `checks` accumulator.
 *
 * Row IDs map to doctor display names:
 *   'Catalog quarantine' — catalog-quarantine-state
 *   'Catalog cache'      — catalog-cache-health
 *
 * @param checks     Doctor check accumulator (mutated in place).
 * @param anvilHome  Path to ~/.anvil (or test tmpdir equivalent).
 */
export async function pushCatalogChecks(
  checks: Check[],
  anvilHome: string,
): Promise<void> {
  const sources = getBuiltInSources()
  const offlineMode = process.env.ANVIL_OFFLINE === '1'

  // Determine if quarantine dir is absent (skip) or present (inspect)
  const qRoot = quarantineRoot(anvilHome)
  const quarantineDirAbsent = !existsSync(qRoot)

  // Load quarantine records
  let quarantineRecords: QuarantineRecord[] = []
  if (!quarantineDirAbsent) {
    quarantineRecords = await listQuarantineRecords(anvilHome)
  }

  // Load validation decisions for each record from their validation.json
  const quarantineDecisions: Record<string, string | undefined> = {}
  for (const record of quarantineRecords) {
    const validationPath = join(
      quarantineDir(anvilHome, record.source.id, record.index_entry.slug),
      'validation.json',
    )
    try {
      const raw = await readFile(validationPath, 'utf-8')
      const parsed = JSON.parse(raw) as { decision?: string }
      if (typeof parsed.decision === 'string') {
        quarantineDecisions[record.quarantine_id] = parsed.decision
      }
    } catch {
      // Absent or malformed — treated as pending (no decision)
    }
  }

  // Load cache meta for each source (skip when offline)
  const cacheMeta: Record<string, CacheMeta | null> = {}
  if (!offlineMode) {
    for (const source of sources) {
      cacheMeta[source.id] = await readMeta(anvilHome, source.id)
    }
  }

  const rows = buildCatalogDoctorRows({
    quarantineRecords,
    quarantineDirAbsent,
    quarantineDecisions,
    cacheMeta,
    offlineMode,
    sourceCount: sources.length,
  })

  // Push quarantine-state row
  checks.push({
    name: ROW_QUARANTINE,
    status: rows.quarantineState.status,
    detail: rows.quarantineState.detail,
    expectedAbsence: rows.quarantineState.expectedAbsence,
  })

  // Push cache-health row
  checks.push({
    name: ROW_CACHE,
    status: rows.cacheHealth.status,
    detail: rows.cacheHealth.detail,
    expectedAbsence: rows.cacheHealth.expectedAbsence,
  })
}
