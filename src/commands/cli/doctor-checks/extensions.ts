/**
 * ANV-0203 (P6) — Doctor row "Extensions".
 *
 * Exports:
 *   - `buildExtensionsDoctorRow` — pure builder, no I/O, fully testable.
 *   - `pushExtensionsCheck`     — thin I/O wrapper; loads registry, calls
 *                                 builder, maps to Check[] rows.
 *
 * Layer 4 (commands/cli/doctor-checks/). Imports allowed from:
 *   - layers 0–3 (core, intent, skills, hooks, agents)
 *   - layer 7 (installer/extensions/)
 *
 * Pure builder MUST NOT call fs, path, os, or any I/O API.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectCollisions } from '../../../installer/extensions/collisions.js'
import { parseManifest } from '../../../installer/extensions/manifest.js'
import { registryPath } from '../../../installer/extensions/paths.js'
import type {
  ExtensionsDoctorRow,
  Registry,
} from '../../../installer/extensions/registry-types.js'
import { loadRegistry } from '../../../installer/extensions/registry.js'
import type { CollisionContext } from '../../../installer/extensions/types.js'

// ─── Local Check interface (mirrors doctor.ts) ────────────────────────────────

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  expectedAbsence?: boolean
  alwaysVisible?: boolean
}

// ─── Version helpers ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve CURRENT_ANVIL_VERSION from the package.json nearest to this file.
 * Resolved once at module-load time. Never throws — falls back to '0.0.0'.
 */
function readAnvilVersion(): string {
  try {
    const pkgPath = join(__dirname, '..', '..', '..', '..', 'package.json')
    const raw = readFileSync(pkgPath, 'utf-8')
    const parsed = JSON.parse(raw) as { version?: unknown }
    if (typeof parsed.version === 'string') return parsed.version
  } catch {
    // ignore
  }
  return '0.0.0'
}

const CURRENT_ANVIL_VERSION = readAnvilVersion()

// ─── Semver comparison (lenient, no external dep) ─────────────────────────────

/**
 * Compare two semver strings. Returns:
 *   -1 when a < b
 *    0 when a === b
 *    1 when a > b
 *
 * Only compares major.minor.patch (pre-release/build ignored for compat checks).
 */
function semverCompare(a: string, b: string): -1 | 0 | 1 {
  const parse = (s: string): [number, number, number] => {
    const m = s.match(/^(\d+)\.(\d+)\.(\d+)/)
    if (!m) return [0, 0, 0]
    return [
      Number.parseInt(m[1]!, 10),
      Number.parseInt(m[2]!, 10),
      Number.parseInt(m[3]!, 10),
    ]
  }
  const [aMaj, aMin, aPat] = parse(a)
  const [bMaj, bMin, bPat] = parse(b)
  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1
  if (aMin !== bMin) return aMin < bMin ? -1 : 1
  if (aPat !== bPat) return aPat < bPat ? -1 : 1
  return 0
}

// ─── Pure builder ─────────────────────────────────────────────────────────────

/**
 * Build the structured doctor row payload from the already-loaded registry.
 * No I/O — accepts pre-loaded data.
 *
 * @param args.registry       The loaded Registry, or null when absent/unreadable.
 * @param args.registryError  Error string when _registry.json was unreadable.
 * @param args.bundled        Sets of bundled core slugs per kind (for Tier 2 collision).
 * @param args.anvilVersion   Current Anvil version string (e.g. "0.15.7").
 */
export function buildExtensionsDoctorRow(args: {
  registry: Registry | null
  registryError: string | null
  bundled: CollisionContext['bundled']
  anvilVersion: string
}): ExtensionsDoctorRow {
  const { registry, registryError, bundled, anvilVersion } = args

  // Registry absent with no error — _registry.json simply doesn't exist yet.
  if (registry === null && registryError === null) {
    return {
      installedCount: 0,
      schemaInvalid: [],
      unresolvedCollisions: [],
      registryError: null,
    }
  }

  // Registry unreadable — propagate the error.
  if (registryError !== null) {
    return {
      installedCount: 0,
      schemaInvalid: [],
      unresolvedCollisions: [],
      registryError,
    }
  }

  // Registry loaded — analyse each installed extension.
  const records = Object.values(registry!.extensions)
  const installedCount = records.length

  const schemaInvalid: ExtensionsDoctorRow['schemaInvalid'] = []
  const unresolvedCollisions: ExtensionsDoctorRow['unresolvedCollisions'] = []

  // Build the installed list for the collision context (excluding each ext in turn).
  const allInstalled = records.map((r) => ({
    name: r.name,
    provides: r.manifest.provides,
  }))

  for (const record of records) {
    // 1. Schema validity re-check (registry rot detector).
    const reparse = parseManifest(record.manifest)
    if (!reparse.ok) {
      schemaInvalid.push({ name: record.name, reason: reparse.error.message })
      // Still continue with compat + collision checks even on schema failure
      // (best-effort — we have enough data from the stored value).
    }

    // 2. Version compatibility check.
    // Guard: compatibility block may be absent for schema-invalid manifests.
    const compat = record.manifest.compatibility as
      | { min_anvil_version?: string; max_anvil_version?: string }
      | undefined
    if (!compat) continue
    const minVer = compat.min_anvil_version
    const maxVer = compat.max_anvil_version

    if (minVer !== undefined && semverCompare(anvilVersion, minVer) < 0) {
      // Current Anvil version is older than the extension's minimum requirement.
      schemaInvalid.push({
        name: record.name,
        reason: `requires min_anvil_version ${minVer} but current Anvil is ${anvilVersion}`,
      })
    } else if (
      maxVer !== undefined &&
      semverCompare(anvilVersion, maxVer) > 0
    ) {
      // Current Anvil version is newer than the extension's maximum.
      schemaInvalid.push({
        name: record.name,
        reason: `requires max_anvil_version ${maxVer} but current Anvil is ${anvilVersion}`,
      })
    }

    // 3. Collision detection — run against all OTHER installed extensions +
    //    the bundled set.
    const ctx: CollisionContext = {
      bundled,
      installed: allInstalled.filter((i) => i.name !== record.name),
    }
    const collisions = detectCollisions(record.manifest, ctx)
    if (collisions.length > 0) {
      unresolvedCollisions.push({
        name: record.name,
        collisions: collisions.map((c) => ({
          tier: c.tier,
          kind: c.kind,
          slug: c.slug,
        })),
      })
    }
  }

  return {
    installedCount,
    schemaInvalid,
    unresolvedCollisions,
    registryError: null,
  }
}

// ─── Thin I/O wrapper ─────────────────────────────────────────────────────────

const ROW_NAME = 'Extensions'

/**
 * Load the registry and push one or more Check rows to `checks`.
 *
 * Row-mapping rules per plan §7:
 *   - _registry.json absent  → skip + expectedAbsence (quiet-suppressed)
 *   - _registry.json error   → fail, detail = error message
 *   - 0 extensions, valid    → pass, alwaysVisible: false (quiet-hidden)
 *   - ≥1 extension, all clean → pass with count detail
 *   - ≥1 collision           → warn per affected extension
 *   - ≥1 schema-invalid      → fail per extension
 *
 * @param checks     Doctor check accumulator (mutated in place).
 * @param anvilHome  Path to ~/.anvil (or test tmpdir equivalent).
 * @param bundled    Sets of bundled core slugs per resource kind.
 *                   TODO(ANV-0028): pass real bundled inventory once catalog
 *                   is available; use empty sets for now (Tier-1 only is still
 *                   useful for installed-extension shadow detection).
 */
export async function pushExtensionsCheck(
  checks: Check[],
  anvilHome: string,
  bundled: CollisionContext['bundled'],
): Promise<void> {
  // Check whether the registry file exists before calling loadRegistry,
  // so we can distinguish "absent" from "unreadable".
  const { existsSync } = await import('node:fs')
  const regPath = registryPath(anvilHome)

  if (!existsSync(regPath)) {
    // Absent — not an error; extensions simply haven't been installed yet.
    checks.push({
      name: ROW_NAME,
      status: 'skip',
      detail: 'no extensions installed (_registry.json absent)',
      expectedAbsence: true,
    })
    return
  }

  let registry: Registry | null = null
  let registryError: string | null = null

  try {
    registry = await loadRegistry(anvilHome)
  } catch (err) {
    registryError = (err as Error).message
  }

  const row = buildExtensionsDoctorRow({
    registry,
    registryError,
    bundled,
    anvilVersion: CURRENT_ANVIL_VERSION,
  })

  // 1. Registry unreadable → single fail row.
  if (row.registryError !== null) {
    checks.push({
      name: ROW_NAME,
      status: 'fail',
      detail: `_registry.json unreadable: ${row.registryError}`,
    })
    return
  }

  // 2. Schema-invalid manifests → one fail row per extension.
  for (const invalid of row.schemaInvalid) {
    checks.push({
      name: ROW_NAME,
      status: 'fail',
      detail: `extension '${invalid.name}': ${invalid.reason}`,
    })
  }

  // 3. Unresolved collisions → one warn row per affected extension.
  for (const collision of row.unresolvedCollisions) {
    const collisionDetail = collision.collisions
      .map((c) => `tier${c.tier} ${c.kind}:${c.slug}`)
      .join(', ')
    checks.push({
      name: ROW_NAME,
      status: 'warn',
      detail: `extension '${collision.name}' has unresolved collision(s): ${collisionDetail}`,
    })
  }

  // 4. Clean summary row.
  if (row.installedCount === 0) {
    checks.push({
      name: ROW_NAME,
      status: 'pass',
      detail: 'no extensions installed',
      alwaysVisible: false,
    })
  } else if (
    row.schemaInvalid.length === 0 &&
    row.unresolvedCollisions.length === 0
  ) {
    checks.push({
      name: ROW_NAME,
      status: 'pass',
      detail: `${row.installedCount} extension(s) installed; no collisions`,
    })
  } else {
    // Problems were already surfaced above; add a count summary row.
    checks.push({
      name: ROW_NAME,
      status: 'pass',
      detail: `${row.installedCount} extension(s) installed`,
    })
  }

  // ANV-0248: open follow-up note — manifest schema gaps still unresolved.
  // tools[] and required_env fields are not yet validated; tracked in ANV-0203.
  checks.push({
    name: `${ROW_NAME} [follow-up]`,
    status: 'warn',
    detail:
      'manifest schema gaps: tools[] + required_env fields unvalidated (ANV-0203)',
  })
}
